import "server-only";

import { can } from "@/lib/auth/rbac";
import type { Viewer } from "@/lib/auth/viewer";
import { calculatePay, type PayCalculation } from "@/lib/payroll/calculate";
import { StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { getMonthlyAttendance } from "./attendance";
import { listStaff, type StaffRecord } from "./staff";

/**
 * Payroll: what attendance says somebody is owed, and who signs it off.
 *
 * A manager prepares a run and an owner decides it. The figures are frozen into
 * the row at preparation time rather than recomputed on read, so a salary
 * change next month cannot quietly rewrite a payslip that has already been
 * approved.
 */

export type RunStatus = "pending" | "approved" | "declined" | "paid";

export type PayrollRun = {
  id: string;
  staffId: string;
  periodMonth: string;
  monthlySalary: number;
  workingDays: number;
  daysPresent: number;
  daysLate: number;
  lateDeduction: number;
  gross: number;
  deductions: number;
  net: number;
  status: RunStatus;
  note: string | null;
  decidedAt: string | null;
};

/**
 * One person's month, ready to be looked at.
 *
 * `live` is what the attendance record says right now; `run` is what was
 * frozen, if anybody has prepared one. Showing both is what makes a stale run
 * visible instead of merely wrong.
 */
export type PayrollLine = {
  staff: StaffRecord;
  daysPresent: number;
  daysLate: number;
  live: PayCalculation;
  run: PayrollRun | null;
};

const RUN_COLUMNS =
  "id, staff_id, period_month, monthly_salary, working_days, days_present, " +
  "days_late, late_deduction, gross, deductions, net, status, note, decided_at";

type RunRow = {
  id: string;
  staff_id: string;
  period_month: string;
  monthly_salary: string | number;
  working_days: number;
  days_present: number;
  days_late: number;
  late_deduction: string | number;
  gross: string | number;
  deductions: string | number;
  net: string | number;
  status: RunStatus;
  note: string | null;
  decided_at: string | null;
};

/** Postgres `numeric` arrives as a string, to preserve exactness in transit. */
const num = (value: string | number): number => Number(value) || 0;

function toRun(row: RunRow): PayrollRun {
  return {
    id: row.id,
    staffId: row.staff_id,
    periodMonth: row.period_month,
    monthlySalary: num(row.monthly_salary),
    workingDays: row.working_days,
    daysPresent: row.days_present,
    daysLate: row.days_late,
    lateDeduction: num(row.late_deduction),
    gross: num(row.gross),
    deductions: num(row.deductions),
    net: num(row.net),
    status: row.status,
    note: row.note,
    decidedAt: row.decided_at,
  };
}

/** The terms `calculatePay` needs, pulled off a staff record. */
function termsFor(member: StaffRecord) {
  return {
    monthlySalary: member.monthlySalary,
    workingDays: member.workingDaysPerMonth,
    lateDeduction: member.lateDeduction,
  };
}

/** Everyone in scope for one month, with live figures and any frozen run. */
export async function getPayrollLines(
  viewer: Viewer,
  periodMonth: string,
): Promise<PayrollLine[]> {
  const staff = (await listStaff(viewer)).filter((member) => member.active);
  if (staff.length === 0) return [];

  const staffIds = staff.map((member) => member.id);

  const [attendance, runs] = await Promise.all([
    getMonthlyAttendance(staffIds, periodMonth),
    supabaseAdmin()
      .from("payroll_runs")
      .select(RUN_COLUMNS)
      .in("staff_id", staffIds)
      .eq("period_month", periodMonth)
      .returns<RunRow[]>(),
  ]);

  if (runs.error) {
    throw new StorageError(`Could not load payroll: ${runs.error.message}`, 502);
  }

  const runByStaff = new Map((runs.data ?? []).map((row) => [row.staff_id, toRun(row)]));

  return staff.map((member) => {
    const summary = attendance.get(member.id) ?? { daysPresent: 0, daysLate: 0 };
    return {
      staff: member,
      daysPresent: summary.daysPresent,
      daysLate: summary.daysLate,
      live: calculatePay(termsFor(member), summary),
      run: runByStaff.get(member.id) ?? null,
    };
  });
}

/**
 * Freezes this month's figures for one person and sends them for sign-off.
 *
 * Re-preparing overwrites a run that is still pending or was declined, which is
 * how a corrected salary gets a second chance. An approved or paid run is left
 * alone: re-cutting a payslip somebody already signed off is a decision for a
 * person, not a side effect of pressing the button again.
 */
export async function preparePayroll(
  viewer: Viewer,
  periodMonth: string,
  staffIds: string[],
): Promise<{ prepared: number; skipped: number }> {
  const lines = (await getPayrollLines(viewer, periodMonth)).filter((line) =>
    staffIds.includes(line.staff.id),
  );

  let prepared = 0;
  let skipped = 0;

  for (const line of lines) {
    if (line.run && (line.run.status === "approved" || line.run.status === "paid")) {
      skipped += 1;
      continue;
    }
    if (line.staff.monthlySalary === null) {
      // Nothing to pay out until somebody sets a salary.
      skipped += 1;
      continue;
    }

    const { error } = await supabaseAdmin().from("payroll_runs").upsert(
      {
        staff_id: line.staff.id,
        period_month: periodMonth,
        monthly_salary: line.staff.monthlySalary,
        working_days: line.staff.workingDaysPerMonth,
        days_present: line.daysPresent,
        days_late: line.daysLate,
        late_deduction: line.staff.lateDeduction,
        gross: line.live.gross,
        deductions: line.live.deductions,
        net: line.live.net,
        status: "pending",
        prepared_by: viewer.staffId,
        decided_by: null,
        decided_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "staff_id,period_month" },
    );

    if (error) throw new StorageError(`Could not prepare payroll: ${error.message}`, 502);
    prepared += 1;
  }

  return { prepared, skipped };
}

/**
 * The owner's decision on a prepared run.
 *
 * Guarded twice over: `payroll:approve` is not in a manager's permission set,
 * and a run can only be decided while it is pending, so a second press cannot
 * flip an approval into a decline behind somebody's back.
 */
export async function decidePayroll(
  viewer: Viewer,
  runId: string,
  decision: "approved" | "declined",
  note: string | null,
): Promise<void> {
  if (!can(viewer.role, "payroll:approve")) {
    throw new StorageError("Only an owner can approve payments.", 403);
  }

  const { data, error } = await supabaseAdmin()
    .from("payroll_runs")
    .update({
      status: decision,
      note,
      decided_by: viewer.staffId,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", "pending")
    .select("id");

  if (error) throw new StorageError(`Could not record the decision: ${error.message}`, 502);
  if (!data || data.length === 0) {
    throw new StorageError("That run has already been decided.", 409);
  }
}

/** Marks an approved run as actually paid out. */
export async function markPaid(viewer: Viewer, runId: string): Promise<void> {
  if (!can(viewer.role, "payroll:approve")) {
    throw new StorageError("Only an owner can mark a payment as made.", 403);
  }

  const { data, error } = await supabaseAdmin()
    .from("payroll_runs")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "approved")
    .select("id");

  if (error) throw new StorageError(`Could not mark it paid: ${error.message}`, 502);
  if (!data || data.length === 0) {
    throw new StorageError("Only an approved run can be marked paid.", 409);
  }
}

/** One worker's own payslips, newest first — for their own page. */
export async function getOwnRuns(staffId: string, limit = 6): Promise<PayrollRun[]> {
  const { data, error } = await supabaseAdmin()
    .from("payroll_runs")
    .select(RUN_COLUMNS)
    .eq("staff_id", staffId)
    .order("period_month", { ascending: false })
    .limit(limit)
    .returns<RunRow[]>();

  if (error) throw new StorageError(`Could not load your pay: ${error.message}`, 502);
  return (data ?? []).map(toRun);
}
