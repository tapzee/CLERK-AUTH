import type { AttendanceEvent, UniformVerdict } from "@/lib/attendance/types";
import { describeFaults, itemsAtGrade, joinList, ITEM_NOUNS } from "@/lib/uniform/items";
import { Card, LocalTime, Pill } from "@/components/ui/primitives";

/**
 * The worker's own record for today.
 *
 * Faults are listed even on a pass: scoring 82 because the apron was untied is
 * worth telling somebody, and it is the only way they know what to fix before
 * tomorrow.
 */
export function TodaysPunches({ events }: { events: AttendanceEvent[] }) {
  return (
    <Card className="p-4">
      <p className="label mb-0">Today</p>

      {events.length === 0 ? (
        <p className="mt-2.5 text-sm text-muted">No punches yet.</p>
      ) : (
        <ul className="mt-2.5 space-y-3">
          {events.map((event) => (
            <li key={event.id} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="font-medium">
                  {event.kind === "in" ? "Checked in" : "Checked out"}
                </span>
                <span className="flex items-baseline gap-2 text-muted">
                  {event.kind === "in" && event.isLate && (
                    <Pill tone="danger">{event.lateByMinutes}m late</Pill>
                  )}
                  {event.kind === "out" && event.earlyByMinutes ? (
                    <Pill tone="warning">{event.earlyByMinutes}m early</Pill>
                  ) : null}
                  <LocalTime at={event.happenedAt} />
                </span>
              </div>
              {event.dressCheck && <VerdictLine check={event.dressCheck} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function VerdictLine({ check }: { check: UniformVerdict }) {
  if (check.status === "skipped") return null;

  if (check.status === "queued" || check.status === "running") {
    return <p className="text-xs text-muted">Uniform check running…</p>;
  }

  if (check.status === "failed") {
    return (
      <p className="text-xs text-muted">
        The uniform check could not finish. Your manager will look at the photo.
      </p>
    );
  }

  const tone =
    check.verdict === "pass"
      ? "text-success"
      : check.verdict === "fail"
        ? "text-danger"
        : "text-warning";

  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 text-xs ${tone}`}>
      {check.score !== null && (
        <span className="rounded-full bg-current/10 px-2 py-0.5 font-medium tabular-nums">
          {check.score}/100
        </span>
      )}
      <span className="text-pretty">
        {detailFor(check)}
        {check.verdict !== "pass" && check.reason && ` — ${check.reason}`}
      </span>
    </p>
  );
}

function detailFor(check: UniformVerdict): string {
  if (check.verdict === "unclear") {
    const unclear = itemsAtGrade(check.items, "?").map((key) => ITEM_NOUNS[key]);
    return unclear.length > 0
      ? `Could not tell — ${joinList(unclear)} unclear. A manager will check.`
      : "Could not tell from the photo. A manager will check.";
  }

  return describeFaults(check.items) ?? (check.verdict === "pass" ? "Uniform OK" : "Below the pass mark");
}
