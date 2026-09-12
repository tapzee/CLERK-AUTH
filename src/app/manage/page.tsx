import Link from "next/link";
import { Users, Clock, UserX, ShieldAlert, CheckCircle, ArrowRight, Banknote } from "lucide-react";

import { can } from "@/lib/auth/rbac";
import { requirePageAccess, type Viewer } from "@/lib/auth/viewer";
import { getDaySheet, getReviewQueue, todayForViewer } from "@/lib/manage/attendance";
import { getPayrollLines } from "@/lib/manage/payroll";
import { formatMoney, monthKey } from "@/lib/payroll/calculate";
import { formatBusinessDate } from "@/lib/time";
import { Card, EmptyState, PageHeader, Pill, Stat } from "@/components/ui/primitives";

export const metadata = { title: "Overview · Console" };

export default async function OverviewPage() {
  const viewer = await requirePageAccess("console:read");
  const today = await todayForViewer(viewer);

  const [sheet, reviews] = await Promise.all([
    getDaySheet(viewer, today),
    getReviewQueue(viewer),
  ]);

  const present = sheet.filter((row) => row.checkIn).length;
  const late = sheet.filter((row) => row.staff.role !== "manager" && row.checkIn?.isLate).length;
  const absent = sheet.length - present;
  const refused = sheet.reduce((total, row) => total + row.rejectedAttempts, 0);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Console Overview"
        title="Today at a glance"
        description={formatBusinessDate(today)}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="On Shift"
          value={`${present}/${sheet.length}`}
          detail={sheet.length === 0 ? "Nobody enrolled yet" : "Checked in today"}
          tone={present > 0 ? "success" : "neutral"}
          icon={<Users className="h-4 w-4" />}
        />
        <Stat
          label="Late Arrivals"
          value={late}
          detail="Past shift grace window"
          tone={late > 0 ? "warning" : "neutral"}
          icon={<Clock className="h-4 w-4" />}
        />
        <Stat
          label="Not In Yet"
          value={absent}
          detail="No check-in logged"
          tone={absent > 0 ? "danger" : "neutral"}
          icon={<UserX className="h-4 w-4" />}
        />
        <Stat
          label="Refused by AI"
          value={refused}
          detail="Turned away by uniform check"
          tone={refused > 0 ? "warning" : "neutral"}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      {reviews.length > 0 && (
        <Card className="border-warning/40 bg-warning-soft/40 p-5 shadow-lg shadow-warning/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-warning/20 text-warning border border-warning/30 shadow-sm">
                <ShieldAlert className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <p className="flex items-center gap-2 font-semibold text-foreground text-sm sm:text-base">
                  <span>Uniform Review Required</span>
                  <Pill tone="warning">{reviews.length} waiting</Pill>
                </p>
                <p className="mt-0.5 text-xs text-muted text-pretty">
                  Unsettled photo checks require manager confirmation.
                </p>
              </div>
            </div>
            <Link href="/manage/review" className="btn btn-primary text-xs sm:text-sm">
              <span>Review now</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>
      )}

      {can(viewer.role, "payroll:approve") && <PayrollWaiting viewer={viewer} />}

      <LateList sheet={sheet} />
    </section>
  );
}

async function PayrollWaiting({ viewer }: { viewer: Viewer }) {
  const month = monthKey(new Date());
  const lines = await getPayrollLines(viewer, month);
  const pending = lines.filter((line) => line.run?.status === "pending");

  if (pending.length === 0) return null;

  const total = pending.reduce((sum, line) => sum + (line.run?.net ?? 0), 0);

  return (
    <Card className="border-accent/40 bg-accent-soft/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/20 text-accent border border-accent/30 shadow-sm">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <p className="flex items-center gap-2 font-semibold text-foreground text-sm sm:text-base">
              <span>Payroll Approvals Waiting</span>
              <Pill tone="accent">{pending.length} pending</Pill>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatMoney(total)} total prepared and awaiting your sign-off.
            </p>
          </div>
        </div>
        <Link href="/manage/payroll" className="btn btn-primary text-xs sm:text-sm">
          <span>Open payroll</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  );
}

function LateList({ sheet }: { sheet: Awaited<ReturnType<typeof getDaySheet>> }) {
  const problems = sheet.filter(
    (row) => !row.checkIn || (row.staff.role !== "manager" && row.checkIn.isLate),
  );

  if (sheet.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="Nobody is enrolled yet"
        body="Add your staff and assign them to a cart, and their attendance will show up here."
      >
        <Link href="/manage/staff" className="btn btn-primary">
          Add staff
        </Link>
      </EmptyState>
    );
  }

  if (problems.length === 0) {
    return (
      <Card className="flex items-center justify-center gap-3.5 border-success/25 bg-success-soft px-5 py-8 text-center">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle className="h-5 w-5" />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-success">Everyone is on shift and on time.</p>
          <p className="text-xs text-muted">No attendance anomalies detected today.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-surface-muted">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Needs Attention ({problems.length})
        </p>
        <span className="font-mono text-xs text-muted">Real-time attendance log</span>
      </div>
      <ul className="divide-y divide-border">
        {problems.map((row) => (
          <li
            key={row.staff.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface-muted"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-muted text-xs font-semibold text-foreground border border-border">
                {row.staff.fullName.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {row.staff.fullName}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {row.staff.role === "manager"
                    ? "Manager · Flexible hours"
                    : row.staff.shiftStart
                    ? `Shift: ${row.staff.shiftStart.slice(0, 5)} · ${row.staff.graceMinutes}m grace`
                    : "No shift assigned"}
                </p>
              </div>
            </div>
            <div>
              {row.checkIn ? (
                <Pill tone="warning">{row.checkIn.lateByMinutes}m late</Pill>
              ) : (
                <Pill tone="danger">Not checked in</Pill>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
