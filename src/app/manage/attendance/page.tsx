import { requirePageAccess } from "@/lib/auth/viewer";
import { getDaySheet, todayForViewer, type DayRow } from "@/lib/manage/attendance";
import { formatDistance } from "@/lib/attendance/geofence";
import { describeFaults } from "@/lib/uniform/items";
import {
  Card,
  EmptyState,
  LocalTime,
  PageHeader,
  Pill,
  type Tone,
} from "@/components/ui/primitives";
import { DayPicker } from "@/components/manage/DayPicker";

export const metadata = { title: "Attendance · Console" };

/**
 * The day sheet: one row per person, whether or not they turned up.
 *
 * This is the screen the whole system exists to produce -- when each worker
 * checked in, how late that was against the shift their manager set, and what
 * the uniform check made of the photo.
 */
export default async function AttendancePage({
  searchParams,
}: PageProps<"/manage/attendance">) {
  const viewer = await requirePageAccess("attendance:read:team");

  const params = await searchParams;
  const requested = typeof params.date === "string" ? params.date : null;
  // A hand-typed date in the query string is not worth a 500.
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
    ? requested
    : await todayForViewer(viewer);

  const sheet = await getDaySheet(viewer, date);

  return (
    <section className="space-y-5">
      <PageHeader
        title="Attendance"
        description="Check-in and check-out times against each worker's shift."
        action={<DayPicker date={date} />}
      />

      {sheet.length === 0 ? (
        <EmptyState
          title="Nobody to show"
          body="Once staff are enrolled and assigned to a cart, their day appears here."
        />
      ) : (
        <>
          {/* Desktop: a real table. */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-muted/60 text-left">
                <tr className="text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-semibold">Worker</th>
                  <th className="px-4 py-2.5 font-semibold">Shift</th>
                  <th className="px-4 py-2.5 font-semibold">In</th>
                  <th className="px-4 py-2.5 font-semibold">Out</th>
                  <th className="px-4 py-2.5 font-semibold">Uniform</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sheet.map((row) => (
                  <tr key={row.staff.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.staff.fullName}</p>
                      <p className="mt-0.5 text-xs text-muted">{row.staff.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums">{shiftText(row)}</td>
                    <td className="px-4 py-3">
                      <CheckInCell row={row} />
                    </td>
                    <td className="px-4 py-3">
                      {row.checkOut ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <LocalTime at={row.checkOut.at} />
                          {row.checkOut.earlyByMinutes ? (
                            <Pill tone="warning">{row.checkOut.earlyByMinutes}m early</Pill>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <UniformCell row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Phone: the same rows, stacked. */}
          <ul className="space-y-2.5 md:hidden">
            {sheet.map((row) => (
              <Card key={row.staff.id} className="p-4">
                <li>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-medium">{row.staff.fullName}</p>
                    <p className="text-xs text-muted tabular-nums">{shiftText(row)}</p>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="label mb-0.5">In</dt>
                      <dd>
                        <CheckInCell row={row} />
                      </dd>
                    </div>
                    <div>
                      <dt className="label mb-0.5">Out</dt>
                      <dd>
                        {row.checkOut ? <LocalTime at={row.checkOut.at} /> : <span className="text-muted">—</span>}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3">
                    <UniformCell row={row} />
                  </div>
                </li>
              </Card>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function shiftText(row: DayRow): string {
  if (!row.staff.shiftStart) return "No shift";
  const end = row.staff.shiftEnd ? `–${row.staff.shiftEnd.slice(0, 5)}` : "";
  return `${row.staff.shiftStart.slice(0, 5)}${end} (+${row.staff.graceMinutes}m)`;
}

/** Arrival time, how late it was, and how far from the cart it was taken. */
function CheckInCell({ row }: { row: DayRow }) {
  if (!row.checkIn) {
    return <Pill tone="danger">Absent</Pill>;
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <LocalTime at={row.checkIn.at} />
      {row.checkIn.isLate ? (
        <Pill tone="danger">{row.checkIn.lateByMinutes}m late</Pill>
      ) : row.checkIn.lateByMinutes ? (
        // Inside the allowance. Worth showing, not worth penalising.
        <Pill tone="neutral">+{row.checkIn.lateByMinutes}m</Pill>
      ) : (
        <Pill tone="success">On time</Pill>
      )}
      {row.checkIn.distanceM !== null && (
        <span className="text-xs text-muted">{formatDistance(row.checkIn.distanceM)}</span>
      )}
    </span>
  );
}

/** The verdict, plus how many selfies were turned away before this one. */
function UniformCell({ row }: { row: DayRow }) {
  const check = row.checkIn?.dressCheck;

  const retries =
    row.rejectedAttempts > 0 ? (
      <Pill tone="warning">
        {row.rejectedAttempts} refused {row.rejectedAttempts === 1 ? "try" : "tries"}
      </Pill>
    ) : null;

  if (!row.checkIn) return retries ?? <span className="text-muted">—</span>;

  if (!check || check.status === "queued" || check.status === "running") {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Pill tone="neutral">Checking…</Pill>
        {retries}
      </span>
    );
  }

  const tone: Tone =
    check.verdict === "pass" ? "success" : check.verdict === "fail" ? "danger" : "warning";

  const faults = describeFaults(check.items);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Pill tone={tone}>
        {check.score !== null ? `${check.score}/100` : (check.verdict ?? "unknown")}
      </Pill>
      {row.checkIn.reviewStatus === "pending" && <Pill tone="warning">Needs review</Pill>}
      {row.checkIn.reviewStatus === "flagged" && <Pill tone="danger">Breach</Pill>}
      {faults && <span className="text-xs text-muted text-pretty">{faults}</span>}
      {retries}
    </span>
  );
}
