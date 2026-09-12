import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Calendar,
  CalendarCheck,
  Clock,
  Banknote,
  Camera,
  Calculator,
  ShieldCheck,
} from "lucide-react";

import { getViewerState } from "@/lib/auth/viewer";
import { getMonthlyAttendance, getWorkerMonth } from "@/lib/manage/attendance";
import { findStaffRecord } from "@/lib/manage/staff";
import { getOwnRuns } from "@/lib/manage/payroll";
import {
  calculatePay,
  formatMoney,
  formatMonth,
  monthKey,
  recentMonths,
} from "@/lib/payroll/calculate";
import { describeFaults } from "@/lib/uniform/items";
import {
  Card,
  EmptyState,
  LocalTime,
  PageHeader,
  Pill,
  Stat,
  type Tone,
} from "@/components/ui/primitives";

export const metadata = { title: "My record" };

export const dynamic = "force-dynamic";

export default async function MyRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const state = await getViewerState();
  if (state.status === "signed-out") redirect("/sign-in");
  if (state.status === "not-enrolled") redirect("/punch");

  const { viewer } = state;

  const months = recentMonths(6);
  const params = await searchParams;
  const requested = typeof params.month === "string" ? params.month : null;
  const month = requested && months.includes(requested) ? requested : monthKey(new Date());

  const [record, punches, attendance, runs] = await Promise.all([
    findStaffRecord(viewer, viewer.staffId),
    getWorkerMonth(viewer.staffId, month),
    getMonthlyAttendance([viewer.staffId], month),
    getOwnRuns(viewer.staffId),
  ]);

  if (!record) redirect("/punch");

  const summary = attendance.get(viewer.staffId) ?? { daysPresent: 0, daysLate: 0 };
  const pay = calculatePay(
    {
      monthlySalary: record.monthlySalary,
      workingDays: record.workingDaysPerMonth,
      lateDeduction: record.lateDeduction,
    },
    summary,
  );

  const run = runs.find((candidate) => candidate.periodMonth === month) ?? null;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Worker Portal"
        title="My Attendance &amp; Pay"
        description={record.fullName}
        action={
          <Link href="/punch" className="btn btn-ghost text-xs sm:text-sm">
            <Camera className="h-4 w-4 text-accent" />
            <span>Punch screen</span>
          </Link>
        }
      />

      <MonthTabs months={months} current={month} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Days present"
          value={summary.daysPresent}
          detail={`of ${record.workingDaysPerMonth} working days`}
          icon={<CalendarCheck className="h-4 w-4 text-accent" />}
        />
        <Stat
          label="Days late"
          value={summary.daysLate}
          detail={`past your ${record.graceMinutes}m grace`}
          tone={summary.daysLate > 0 ? "warning" : "success"}
          icon={<Clock className="h-4 w-4 text-accent" />}
        />
        <Stat
          label={run ? "Payslip" : "Estimated pay"}
          value={record.monthlySalary === null ? "—" : formatMoney(run?.net ?? pay.net)}
          detail={
            record.monthlySalary === null
              ? "No salary configured"
              : run
                ? statusLine(run.status)
                : "pending manager sign-off"
          }
          tone={run?.status === "paid" || run?.status === "approved" ? "success" : "neutral"}
          icon={<Banknote className="h-4 w-4 text-accent" />}
        />
      </div>

      {record.monthlySalary !== null && (
        <Card className="p-5">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <Calculator className="h-4 w-4 text-accent" />
            <p className="label mb-0">Transparent Pay Arithmetic</p>
          </div>

          <dl className="mt-4 space-y-2.5 text-xs sm:text-sm">
            <Line
              label={`${formatMoney(record.monthlySalary)} base ÷ ${record.workingDaysPerMonth} days`}
              value={`${formatMoney(pay.perDay)} per day`}
            />
            <Line
              label={`× ${pay.payableDays} ${pay.payableDays === 1 ? "day" : "days"} present on shift`}
              value={formatMoney(pay.gross)}
            />
            {pay.deductions > 0 && (
              <Line
                label={`− ${summary.daysLate} late days × ${formatMoney(record.lateDeduction)} deduction`}
                value={`−${formatMoney(pay.deductions)}`}
                tone="danger"
              />
            )}
            <div className="flex items-baseline justify-between gap-4 border-t border-border/80 pt-3 font-bold text-foreground sm:text-base">
              <dt>Calculated Take-Home</dt>
              <dd className="font-mono text-accent tabular-nums text-lg">
                {formatMoney(pay.net)}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">Punches in {formatMonth(month)}</p>
          <span className="font-mono text-xs text-muted">{punches.length} total</span>
        </div>

        {punches.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-5 w-5" />}
            title="No punches recorded for this month"
          />
        ) : (
          <Card className="divide-y divide-border/60 p-0 overflow-hidden">
            {punches.map((punch) => {
              const faults = describeFaults(punch.dressCheck?.items ?? null);

              return (
                <div
                  key={punch.eventId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-xs transition-colors hover:bg-surface-muted/30 sm:text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-foreground">
                      {new Date(punch.at).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {faults && <span className="text-xs text-muted">{faults}</span>}
                    {punch.isLate && <Pill tone="danger">{punch.lateByMinutes}m late</Pill>}
                    {punch.dressCheck?.score !== null &&
                      punch.dressCheck?.score !== undefined && (
                        <Pill tone={punch.dressCheck.verdict === "pass" ? "success" : "warning"}>
                          <ShieldCheck className="h-3 w-3 inline mr-0.5" />
                          {punch.dressCheck.score}/100
                        </Pill>
                      )}
                    <LocalTime at={punch.at} />
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </section>
  );
}

function statusLine(status: string): string {
  const lines: Record<string, string> = {
    pending: "waiting on manager approval",
    approved: "approved, ready for payout",
    declined: "declined — contact your manager",
    paid: "paid",
  };
  return lines[status] ?? status;
}

function Line({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-mono font-medium tabular-nums ${tone === "danger" ? "text-danger" : "text-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}

function MonthTabs({ months, current }: { months: string[]; current: string }) {
  return (
    <nav aria-label="Month" className="-mx-1 flex gap-1.5 overflow-x-auto pb-1.5">
      {months.map((month) => (
        <Link
          key={month}
          href={`/me?month=${month}`}
          aria-current={month === current ? "page" : undefined}
          className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold tracking-tight transition-all sm:text-sm ${
            month === current
              ? "bg-accent text-accent-foreground shadow-sm shadow-accent/20"
              : "text-muted hover:bg-surface hover:text-foreground border border-transparent hover:border-border/50"
          }`}
        >
          {formatMonth(month)}
        </Link>
      ))}
    </nav>
  );
}
