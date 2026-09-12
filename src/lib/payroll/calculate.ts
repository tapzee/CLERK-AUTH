/**
 * Turning attendance into a number.
 *
 * Pure and dependency-free on purpose: the console uses it to prepare a run,
 * and the worker's own page uses it to show the same figure before anyone has
 * prepared anything. One implementation means the two can never disagree, which
 * matters more here than in most places -- a payslip that does not match what
 * the worker was shown last week is an argument, not a bug report.
 */

export type SalaryTerms = {
  /** What a full month pays. Null when no salary has been set yet. */
  monthlySalary: number | null;
  /** The divisor: 26 is a six-day week, 30 pays for rest days too. */
  workingDays: number;
  /** Flat amount docked for each day marked late. */
  lateDeduction: number;
};

export type AttendanceSummary = {
  /** Distinct days with a check-in. */
  daysPresent: number;
  /** Of those, the days the check-in fell outside the grace allowance. */
  daysLate: number;
};

export type PayCalculation = {
  perDay: number;
  /** Days actually paid for -- capped, see below. */
  payableDays: number;
  gross: number;
  deductions: number;
  net: number;
};

/** Money, to the paisa. Kept out of floating-point drift on every step. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePay(
  terms: SalaryTerms,
  summary: AttendanceSummary,
): PayCalculation {
  const monthly = terms.monthlySalary ?? 0;
  const workingDays = Math.max(1, terms.workingDays);

  const perDay = monthly / workingDays;

  /*
   * Capped at the month's working days.
   *
   * Somebody who covers 28 days against a 26-day basis has not earned 108% of
   * a monthly salary -- they have worked extra days, which is an overtime
   * conversation rather than something to pay out silently. Capping keeps the
   * figure defensible and makes the mismatch visible in the day count instead.
   */
  const payableDays = Math.min(summary.daysPresent, workingDays);

  const gross = round2(perDay * payableDays);
  const deductions = round2(summary.daysLate * terms.lateDeduction);

  return {
    perDay: round2(perDay),
    payableDays,
    gross,
    deductions,
    // A deduction can never turn into a debt.
    net: round2(Math.max(0, gross - deductions)),
  };
}

/** The first day of a month, as the `period_month` column stores it. */
export function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/** The last day of the month a `period_month` names, inclusive. */
export function monthEnd(periodMonth: string): string {
  const [year, month] = periodMonth.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, 10);
}

/** "September 2026" */
export function formatMonth(periodMonth: string): string {
  const [year, month] = periodMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The last `count` months, newest first, as period keys. */
export function recentMonths(count: number, from: Date = new Date()): string[] {
  const months: string[] = [];
  for (let back = 0; back < count; back += 1) {
    months.push(monthKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - back, 1))));
  }
  return months;
}

/** Indian-style money formatting, which is what this business reads in. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
