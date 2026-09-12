import { Clock, MapPin, ShieldCheck, Radio } from "lucide-react";

import type { AttendanceStatus } from "@/lib/attendance/types";
import type { checkGeofence } from "@/lib/attendance/geofence";
import { formatDistance } from "@/lib/attendance/geofence";
import type { useGeolocation } from "@/lib/hooks/useGeolocation";
import { Card, Dot, Pill } from "@/components/ui/primitives";

/**
 * The two strips above the viewfinder: who is punching, and whether they are
 * allowed to yet.
 */

/** Name, cart and today's shift window, so a wrong account is obvious at once. */
export function WorkerCard({ worker }: { worker: AttendanceStatus["worker"] }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-sm font-semibold text-accent shadow-sm border border-accent/20">
            {worker.fullName.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground text-sm sm:text-base">{worker.fullName}</p>
              <Pill tone="accent" className="font-mono text-[10px]">
                {worker.role}
              </Pill>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
              <MapPin className="h-3.5 w-3.5 text-accent" />
              <span>{worker.cart.name}</span>
            </div>
          </div>
        </div>

        {worker.shiftStart ? (
          <div className="flex items-center gap-2 rounded-xl bg-surface-muted/50 px-3 py-1.5 text-xs text-muted border border-border">
            <Clock className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono">
              Shift: {worker.shiftStart.slice(0, 5)}
              {worker.shiftEnd ? `–${worker.shiftEnd.slice(0, 5)}` : ""} ({worker.graceMinutes}m grace)
            </span>
          </div>
        ) : (
          <div className="rounded-xl bg-surface-muted/50 px-3 py-1.5 text-xs text-muted border border-border">
            {worker.role === "manager" ? "Flexible manager hours" : "No fixed shift assigned"}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Live distance to the cart.
 *
 * The verdict shown here is the browser's own copy of the rule; the server runs
 * it again and only its answer is recorded. Showing it early is what stops
 * somebody framing a photo they were never going to be allowed to send.
 */
export function GeofenceBar({
  fence,
  cartName,
  geo,
}: {
  fence: ReturnType<typeof checkGeofence>;
  cartName: string;
  geo: ReturnType<typeof useGeolocation>;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-xs transition-colors duration-200 sm:text-sm ${
        fence.ok
          ? "border-success/30 bg-success-soft text-foreground"
          : "border-border bg-surface text-muted"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Dot tone={fence.ok ? "success" : "neutral"} pulse={fence.ok} />
        <span className="truncate font-medium text-pretty">
          {fence.ok
            ? `At ${cartName} · Inside geofence radar (${formatDistance(fence.distanceM ?? 0)} from cart)`
            : geo.status === "locating"
              ? "Triangulating GPS coordinates…"
              : (fence.reason ?? "Location unavailable.")}
        </span>
      </div>
      {geo.status === "denied" ? (
        <button onClick={geo.retry} className="shrink-0 font-medium text-accent underline">
          Retry GPS
        </button>
      ) : fence.ok ? (
        <div className="flex shrink-0 items-center gap-1.5 rounded-[6px] border border-success/25 bg-success/10 px-2 py-0.5 font-mono text-[10px] font-medium text-success">
          <ShieldCheck className="h-3 w-3" />
          <span>verified</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 shrink-0 font-mono text-[10px] text-muted">
          <Radio className="h-3 w-3 animate-pulse" />
          <span>Searching</span>
        </div>
      )}
    </div>
  );
}
