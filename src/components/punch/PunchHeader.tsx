import { Clock, MapPin } from "lucide-react";

import type { AttendanceStatus } from "@/lib/attendance/types";
import type { checkGeofence } from "@/lib/attendance/geofence";
import { formatDistance } from "@/lib/attendance/geofence";
import type { useGeolocation } from "@/lib/hooks/useGeolocation";
import { Card, Dot } from "@/components/ui/primitives";

/**
 * The two strips above the viewfinder: who is punching, and whether they are
 * allowed to yet.
 */

/** Name, cart and today's shift window, so a wrong account is obvious at once. */
export function WorkerCard({ worker }: { worker: AttendanceStatus["worker"] }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-xs font-bold text-accent">
            {worker.fullName.charAt(0)}
          </div>
          <p className="font-semibold text-foreground">{worker.fullName}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <MapPin className="h-3.5 w-3.5 text-accent" />
          <span>{worker.cart.name}</span>
        </div>
      </div>
      {worker.shiftStart ? (
        <div className="mt-2.5 flex items-center gap-2 text-xs text-muted">
          <Clock className="h-3.5 w-3.5" />
          <span>
            Shift {worker.shiftStart.slice(0, 5)}
            {worker.shiftEnd ? ` – ${worker.shiftEnd.slice(0, 5)}` : ""} ·{" "}
            {worker.graceMinutes}m grace
          </span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">No scheduled shift — lateness not docked.</p>
      )}
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
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs transition-all duration-200 sm:text-sm ${
        fence.ok
          ? "border-success/30 bg-success-soft/70 text-foreground"
          : "border-border bg-surface-glass text-muted"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Dot tone={fence.ok ? "success" : "neutral"} pulse={fence.ok} />
        <span className="truncate text-pretty">
          {fence.ok
            ? `At ${cartName} (${formatDistance(fence.distanceM ?? 0)} from cart)`
            : geo.status === "locating"
              ? "Triangulating GPS location…"
              : (fence.reason ?? "Location unavailable.")}
        </span>
      </div>
      {geo.status === "denied" ? (
        <button onClick={geo.retry} className="shrink-0 font-medium text-accent underline">
          Retry GPS
        </button>
      ) : fence.ok ? (
        <span className="shrink-0 text-[11px] font-semibold text-success">Verified</span>
      ) : null}
    </div>
  );
}
