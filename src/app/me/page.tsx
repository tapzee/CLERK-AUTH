import Link from "next/link";
import { redirect } from "next/navigation";

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

/**
 * A worker's own attendance and pay.
 *
 * Deliberately shows the same arithmetic the console does, from the same
 * function, so somebody who checks their pay here and then queries it is
 * looking at the number their manager sees rather than a rounded-off cousin.
 */
export default async function MyRecordPage({ searchParams }: PageProps<"/me">) {
  const state = await getViewerState();
  if (state.status === "signed-out") redirect("/sign-in");
  if (state.status === "not-enrolled") redirect("/punch");

  const { viewer } = state;

  const months = recentMonths(6);
  const params = await searchParams;
  const requested = typeof params.month === "string" ? params.month : null;
  const month = requested && months.includes(requested) ? requested : monthKey(new Date());

  // `findStaffRecord` is scoped, and a worker's own row is always inside their
  // own scope, so this is the same read the console makes.
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
    <section className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="My record"
        description={record.fullName}
        action={
          <Link href="/punch" className="btn btn-ghost">
            Punch screen
          </Link>
        }
      />

      <MonthTabs months={months} current={month} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Days present" value={summary.daysPresent} detail={`of ${record.workingDaysPerMonth} working days`} />
        <Stat
          label="Days late"
          value={summary.daysLate}
          detail={`past your ${record.graceMinutes} min grace`}
          tone={summary.daysLate > 0 ? "warning" : "success"}
        />
        <Stat
          label={run ? "Payslip" : "Estimated pay"}
          value={record.monthlySalary === null ? "—" : formatMoney(run?.net ?? pay.net)}
          detail={
            record.monthlySalary === null
              ? "No salary set yet"
              : run
                ? statusLine(run.status)
                : "not yet sent for approval"
          }
          tone={run?.status === "paid" || run?.status === "approved" ? "success" : "neutral"}
        />
      </div>

      {record.monthlySalary !== null && (
        <Card className="p-4">
          <p className="label mb-2">How that is worked out</p>
          <dl className="space-y-1.5 text-sm">
            <Line
              label={`${formatMoney(record.monthlySalary)} ÷ ${record.workingDaysPerMonth} days`}
              value={`${formatMoney(pay.perDay)} per day`}
            />
            <Line
              label={`× ${pay.payableDays} ${pay.payableDays === 1 ? "day" : "days"} present`}
              value={formatMoney(pay.gross)}
            />
            {pay.deductions > 0 && (
              <Line
                label={`− ${summary.daysLate} late × ${formatMoney(record.lateDeduction)}`}
                value={`−${formatMoney(pay.deductions)}`}
                tone="danger"
              />
            )}
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-1.5 font-medium">
              <dt>Take home</dt>
              <dd className="tabular-nums">{formatMoney(pay.net)}</dd>
            </div>
          </dl>
        </Card>
      )}

      <div className="space-y-2">
        <p className="label">Punches in {formatMonth(month)}</p>

        {punches.length === 0 ? (
          <EmptyState title="No punches this month" />
        ) : (
          <Card className="divide-y divide-border">
            {punches.map((punch) => {
              const faults = describeFaults(punch.dressCheck?.items ?? null);

              return (
                <div
                  key={punch.eventId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
                >
                  <span className="text-muted">
                    {new Date(punch.at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {faults && <span className="text-xs text-muted">{faults}</span>}
                    {punch.isLate && <Pill tone="danger">{punch.lateByMinutes}m late</Pill>}
                    {punch.dressCheck?.score !== null &&
                      punch.dressCheck?.score !== undefined && (
                        <Pill tone={punch.dressCheck.verdict === "pass" ? "success" : "warning"}>
                          {punch.dressCheck.score}/100
                        </Pill>
                      )}
                    <LocalTime at={punch.at} />
                  </span>
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
    pending: "waiting on approval",
    approved: "approved, not yet paid",
    declined: "declined — ask your manager",
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
      <dd className={`tabular-nums ${tone === "danger" ? "text-danger" : ""}`}>{value}</dd>
    </div>
  );
}

/** Month switcher. Links rather than a select, so it works without JavaScript. */
function MonthTabs({ months, current }: { months: string[]; current: string }) {
  return (
    <nav aria-label="Month" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {months.map((month) => (
        <Link
          key={month}
          href={`/me?month=${month}`}
          aria-current={month === current ? "page" : undefined}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
            month === current
              ? "bg-accent-soft font-medium text-accent"
              : "text-muted hover:bg-surface-muted hover:text-foreground"
          }`}
        >
          {formatMonth(month)}
        </Link>
      ))}
    </nav>
  );
}
