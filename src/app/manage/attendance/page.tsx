import { Users, ShieldCheck } from "lucide-react";
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

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const viewer = await requirePageAccess("attendance:read:team");

  const params = await searchParams;
  const requested = typeof params.date === "string" ? params.date : null;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
    ? requested
    : await todayForViewer(viewer);

  const sheet = await getDaySheet(viewer, date);

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Roster & Logs"
        title="Attendance Sheet"
        description="Daily check-in, check-out times, and automated uniform verification."
        action={<DayPicker date={date} />}
      />

      {sheet.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No attendance records"
          body="Once staff are enrolled and assigned to a cart, their attendance will appear here."
        />
      ) : (
        <>
          {/* Desktop Table View */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/80 bg-surface-muted/50">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  <th className="px-4 py-3">Worker</th>
                  <th className="px-4 py-3">Assigned Shift</th>
                  <th className="px-4 py-3">Check In</th>
                  <th className="px-4 py-3">Check Out</th>
                  <th className="px-4 py-3">Uniform Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sheet.map((row) => (
                  <tr
                    key={row.staff.id}
                    className="transition-colors hover:bg-surface-muted/30"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-7 w-7 place-items-center rounded-lg bg-surface-muted text-xs font-bold text-foreground">
                          {row.staff.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{row.staff.fullName}</p>
                          <p className="text-xs text-muted">{row.staff.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-muted">
                      {shiftText(row)}
                    </td>
                    <td className="px-4 py-3.5">
                      <CheckInCell row={row} />
                    </td>
                    <td className="px-4 py-3.5">
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
                    <td className="px-4 py-3.5">
                      <UniformCell row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile Card View */}
          <ul className="space-y-3 md:hidden">
            {sheet.map((row) => (
              <li key={row.staff.id}>
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-xs font-bold text-accent">
                        {row.staff.fullName.charAt(0)}
                      </div>
                      <p className="font-semibold text-foreground text-sm">{row.staff.fullName}</p>
                    </div>
                    <span className="font-mono text-xs text-muted">{shiftText(row)}</span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-surface-muted/50 p-2.5">
                      <dt className="label mb-1">Check In</dt>
                      <dd>
                        <CheckInCell row={row} />
                      </dd>
                    </div>
                    <div className="rounded-xl bg-surface-muted/50 p-2.5">
                      <dt className="label mb-1">Check Out</dt>
                      <dd className="mt-0.5">
                        {row.checkOut ? (
                          <span className="flex items-center gap-1.5">
                            <LocalTime at={row.checkOut.at} />
                            {row.checkOut.earlyByMinutes ? (
                              <Pill tone="warning">{row.checkOut.earlyByMinutes}m early</Pill>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 border-t border-border/40 pt-2.5">
                    <UniformCell row={row} />
                  </div>
                </Card>
              </li>
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

function CheckInCell({ row }: { row: DayRow }) {
  if (!row.checkIn) {
    return <Pill tone="danger">Absent</Pill>;
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <LocalTime at={row.checkIn.at} />
      {row.checkIn.isLate ? (
        <Pill tone="danger">{row.checkIn.lateByMinutes}m late</Pill>
      ) : row.checkIn.lateByMinutes ? (
        <Pill tone="neutral">+{row.checkIn.lateByMinutes}m</Pill>
      ) : (
        <Pill tone="success">On time</Pill>
      )}
      {row.checkIn.distanceM !== null && (
        <span className="text-[11px] font-mono text-muted">
          ({formatDistance(row.checkIn.distanceM)})
        </span>
      )}
    </span>
  );
}

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
    <span className="flex flex-wrap items-center gap-1.5">
      <Pill tone={tone}>
        <ShieldCheck className="h-3 w-3 inline mr-0.5" />
        {check.score !== null ? `${check.score}/100` : (check.verdict ?? "unknown")}
      </Pill>
      {row.checkIn.reviewStatus === "pending" && <Pill tone="warning">Needs review</Pill>}
      {row.checkIn.reviewStatus === "flagged" && <Pill tone="danger">Breach</Pill>}
      {faults && <span className="text-xs text-muted text-pretty">{faults}</span>}
      {retries}
    </span>
  );
}
