import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import type { AttendanceEvent, UniformVerdict } from "@/lib/attendance/types";
import { describeFaults, itemsAtGrade, joinList, ITEM_NOUNS } from "@/lib/uniform/items";
import { Card, LocalTime, Pill } from "@/components/ui/primitives";

export function TodaysPunches({ events }: { events: AttendanceEvent[] }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <p className="label mb-0">Today&rsquo;s Timeline</p>
        <span className="text-[11px] font-mono text-muted">
          {events.length} {events.length === 1 ? "record" : "records"}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="mt-3 text-xs text-muted">No punches recorded yet today.</p>
      ) : (
        <ul className="mt-3 space-y-3.5">
          {events.map((event) => {
            const isIn = event.kind === "in";
            return (
              <li
                key={event.id}
                className="group relative rounded-xl border border-border/50 bg-surface/50 p-3 transition-all duration-150 hover:bg-surface-muted/60"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-lg ${
                        isIn
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-muted text-muted"
                      }`}
                    >
                      {isIn ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
                    </span>
                    <span className="font-semibold text-xs text-foreground sm:text-sm">
                      {isIn ? "Check in" : "Check out"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isIn && event.isLate && (
                      <Pill tone="danger">{event.lateByMinutes}m late</Pill>
                    )}
                    {!isIn && event.earlyByMinutes ? (
                      <Pill tone="warning">{event.earlyByMinutes}m early</Pill>
                    ) : null}
                    <LocalTime at={event.happenedAt} />
                  </div>
                </div>

                {event.dressCheck && (
                  <div className="mt-2.5 border-t border-border/40 pt-2">
                    <VerdictLine check={event.dressCheck} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function VerdictLine({ check }: { check: UniformVerdict }) {
  if (check.status === "skipped") return null;

  if (check.status === "queued" || check.status === "running") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-accent" />
        <span>Uniform analysis in progress…</span>
      </div>
    );
  }

  if (check.status === "failed") {
    return (
      <p className="text-xs text-muted">
        Uniform check could not run automatically — manager review pending.
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
    <div className={`flex flex-wrap items-center gap-2 text-xs ${tone}`}>
      {check.score !== null && (
        <span className="inline-flex items-center gap-1 rounded-md bg-current/10 px-2 py-0.5 font-bold font-mono text-[11px]">
          <ShieldCheck className="h-3 w-3" />
          {check.score}/100
        </span>
      )}
      <span className="text-pretty">
        {detailFor(check)}
        {check.verdict !== "pass" && check.reason && ` · ${check.reason}`}
      </span>
    </div>
  );
}

function detailFor(check: UniformVerdict): string {
  if (check.verdict === "unclear") {
    const unclear = itemsAtGrade(check.items, "?").map((key) => ITEM_NOUNS[key]);
    return unclear.length > 0
      ? `Could not verify ${joinList(unclear)}.`
      : "Photo unclear. Manager will review.";
  }

  return describeFaults(check.items) ?? (check.verdict === "pass" ? "Full Uniform Verified" : "Score below threshold");
}
