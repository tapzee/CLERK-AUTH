import Link from "next/link";

import { can } from "@/lib/auth/rbac";
import { requirePageAccess, type Viewer } from "@/lib/auth/viewer";
import { getDaySheet, getReviewQueue, todayForViewer } from "@/lib/manage/attendance";
import { getPayrollLines } from "@/lib/manage/payroll";
import { formatMoney, monthKey } from "@/lib/payroll/calculate";
import { Card, EmptyState, PageHeader, Pill, Stat } from "@/components/ui/primitives";

export const metadata = { title: "Overview · Console" };

/**
 * What a manager wants to know before they have asked a question: who is
 * missing, who was late, and what is waiting on them.
 */
export default async function OverviewPage() {
  const viewer = await requirePageAccess("console:read");
  const today = await todayForViewer(viewer);

  const [sheet, reviews] = await Promise.all([
    getDaySheet(viewer, today),
    getReviewQueue(viewer),
  ]);

  const present = sheet.filter((row) => row.checkIn).length;
  const late = sheet.filter((row) => row.checkIn?.isLate).length;
  const absent = sheet.length - present;
  const refused = sheet.reduce((total, row) => total + row.rejectedAttempts, 0);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Today"
        description={new Date(`${today}T00:00:00`).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="On shift"
          value={`${present}/${sheet.length}`}
          detail={sheet.length === 0 ? "Nobody enrolled yet" : "checked in today"}
          tone={present > 0 ? "success" : "neutral"}
        />
        <Stat
          label="Late"
          value={late}
          detail="arrived past their grace window"
          tone={late > 0 ? "warning" : "neutral"}
        />
        <Stat
          label="Not in yet"
          value={absent}
          detail="no check-in recorded"
          tone={absent > 0 ? "danger" : "neutral"}
        />
        <Stat
          label="Selfies refused"
          value={refused}
          detail="turned away by the uniform check"
          tone={refused > 0 ? "warning" : "neutral"}
        />
      </div>

      {reviews.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-medium">
                Uniform review
                <Pill tone="warning">{reviews.length} waiting</Pill>
              </p>
              <p className="mt-0.5 text-sm text-muted text-pretty">
                These punches are already recorded. The check could not settle the
                photo, so somebody has to look.
              </p>
            </div>
            <Link href="/manage/review" className="btn btn-primary">
              Review now
            </Link>
          </div>
        </Card>
      )}

      {can(viewer.role, "payroll:approve") && <PayrollWaiting viewer={viewer} />}

      <LateList sheet={sheet} />
    </section>
  );
}

/** The owner's cue: money somebody has prepared and is waiting on. */
async function PayrollWaiting({
  viewer,
}: {
  viewer: Viewer;
}) {
  const month = monthKey(new Date());
  const lines = await getPayrollLines(viewer, month);
  const pending = lines.filter((line) => line.run?.status === "pending");

  if (pending.length === 0) return null;

  const total = pending.reduce((sum, line) => sum + (line.run?.net ?? 0), 0);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium">
            Payments to approve
            <Pill tone="accent">{pending.length}</Pill>
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {formatMoney(total)} prepared and waiting on you.
          </p>
        </div>
        <Link href="/manage/payroll" className="btn btn-primary">
          Open payroll
        </Link>
      </div>
    </Card>
  );
}

/** Names, not just a number — a count of 3 does not tell you who to call. */
function LateList({ sheet }: { sheet: Awaited<ReturnType<typeof getDaySheet>> }) {
  const problems = sheet.filter((row) => !row.checkIn || row.checkIn.isLate);

  if (sheet.length === 0) {
    return (
      <EmptyState
        title="Nobody is enrolled yet"
        body="Add your staff and assign them to a cart, and their day will show up here."
      >
        <Link href="/manage/staff" className="btn btn-primary">
          Add staff
        </Link>
      </EmptyState>
    );
  }

  if (problems.length === 0) {
    return (
      <Card className="px-5 py-8 text-center">
        <p className="text-sm font-medium text-success">Everybody is in, on time.</p>
        <p className="mt-1 text-sm text-muted">Nothing needs your attention today.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <p className="border-b border-border px-4 py-3 text-sm font-medium">
        Needs a look ({problems.length})
      </p>
      <ul className="divide-y divide-border">
        {problems.map((row) => (
          <li
            key={row.staff.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.staff.fullName}</p>
              <p className="mt-0.5 text-xs text-muted">
                {row.staff.shiftStart
                  ? `Shift from ${row.staff.shiftStart.slice(0, 5)} · ${row.staff.graceMinutes} min grace`
                  : "No shift set"}
              </p>
            </div>
            {row.checkIn ? (
              <Pill tone="warning">{row.checkIn.lateByMinutes} min late</Pill>
            ) : (
              <Pill tone="danger">Not in</Pill>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
