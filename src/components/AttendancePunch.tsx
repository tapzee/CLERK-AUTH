"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { checkGeofence, formatDistance } from "@/lib/attendance/geofence";
import type { AttendanceEvent, AttendanceStatus, DressCheck, PunchKind } from "@/lib/attendance/types";
import { captureFrame } from "@/lib/image";
import { isFixFresh, useGeolocation } from "@/lib/hooks/useGeolocation";

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "review" }
  | { kind: "submitting" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

type Shot = {
  previewUrl: string;
  blob: Blob;
  width: number;
  height: number;
};

const LABEL: Record<PunchKind, string> = { in: "Check in", out: "Check out" };

/** How long to keep re-asking the server while a verdict is still pending. */
const VERDICT_POLL_MS = 2500;
const VERDICT_POLL_LIMIT = 8;

export function AttendancePunch({ status }: { status: AttendanceStatus }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [shot, setShot] = useState<Shot | null>(null);
  const [polls, setPolls] = useState(0);

  // The fix is watched for the whole page, not just while the camera is open,
  // so the geofence verdict is already settled by the time the shutter fires.
  const geo = useGeolocation(true);

  const { staff, events, nextKind } = status;
  const cart = staff.cart;

  const fresh = geo.fix && isFixFresh(geo.fix) ? geo.fix : null;
  const fence = checkGeofence(
    fresh && { latitude: fresh.latitude, longitude: fresh.longitude, accuracyM: fresh.accuracyM },
    cart,
  );

  // A verdict lands a second or two after the punch, on a background worker.
  // Rather than hold the request open for it, the page asks again until it
  // settles, then stops.
  const awaitingVerdict = events.some(
    (event) =>
      event.dressCheck?.status === "queued" || event.dressCheck?.status === "running",
  );

  useEffect(() => {
    if (!awaitingVerdict || polls >= VERDICT_POLL_LIMIT) return;

    const timer = setTimeout(() => {
      setPolls((count) => count + 1);
      router.refresh();
    }, VERDICT_POLL_MS);

    return () => clearTimeout(timer);
  }, [awaitingVerdict, polls, router]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot.previewUrl);
    };
  }, [shot]);

  const startCamera = useCallback(async () => {
    setPhase({ kind: "starting" });
    stopStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase({
        kind: "error",
        message: "This browser has no camera API. Camera access needs HTTPS or localhost.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase({ kind: "live" });
    } catch (error) {
      setPhase({
        kind: "error",
        message:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow it in your browser settings and try again."
            : "Could not start the camera. Is another app using it?",
      });
    }
  }, [stopStream]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    // One frame serves both the manager's review and the uniform check.
    const frame = await captureFrame(video);
    if (!frame) {
      setPhase({ kind: "error", message: "Could not read a frame from the camera." });
      return;
    }

    stopStream();
    setShot({
      previewUrl: URL.createObjectURL(frame.blob),
      blob: frame.blob,
      width: frame.width,
      height: frame.height,
    });
    setPhase({ kind: "review" });
  }, [stopStream]);

  const retake = useCallback(() => {
    if (shot) URL.revokeObjectURL(shot.previewUrl);
    setShot(null);
    void startCamera();
  }, [shot, startCamera]);

  const submit = useCallback(async () => {
    if (!shot) return;
    setPhase({ kind: "submitting" });

    const form = new FormData();
    form.append("photo", shot.blob, "punch.jpg");
    form.append("kind", nextKind);
    form.append("width", String(shot.width));
    form.append("height", String(shot.height));
    form.append("capturedAt", new Date().toISOString());

    if (fresh) {
      form.append("latitude", String(fresh.latitude));
      form.append("longitude", String(fresh.longitude));
      form.append("accuracyM", String(fresh.accuracyM));
      if (fresh.altitudeM !== null) form.append("altitudeM", String(fresh.altitudeM));
    } else {
      form.append("locationError", geo.error ?? "no fresh location fix");
    }

    try {
      const response = await fetch("/api/attendance", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setPhase({ kind: "error", message: body.error ?? "Could not record the punch." });
        return;
      }

      URL.revokeObjectURL(shot.previewUrl);
      setShot(null);
      setPolls(0);

      const late = body.event?.lateByMinutes;
      setPhase({
        kind: "done",
        message:
          nextKind === "in"
            ? late
              ? `Checked in — ${late} min late.`
              : "Checked in on time."
            : "Checked out. See you tomorrow.",
      });
      router.refresh();
    } catch {
      setPhase({ kind: "error", message: "Network error. Check your connection and retry." });
    }
  }, [fresh, geo.error, nextKind, router, shot]);

  const busy = phase.kind === "submitting";

  return (
    <div className="space-y-4">
      {/* Who and where -------------------------------------------------- */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-medium">{staff.fullName}</p>
          <p className="text-sm text-muted">{cart.name}</p>
        </div>
        {staff.shiftStart && (
          <p className="mt-1 text-xs text-muted">
            Shift {staff.shiftStart.slice(0, 5)}
            {staff.shiftEnd ? ` – ${staff.shiftEnd.slice(0, 5)}` : ""}
          </p>
        )}
      </div>

      {/* Live geofence readout ------------------------------------------ */}
      <div
        className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm ${
          fence.ok
            ? "border-[color:var(--success)]/30 bg-[color:var(--success)]/10"
            : "border-border bg-surface-muted"
        }`}
      >
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${
            fence.ok ? "bg-[color:var(--success)]" : "bg-muted"
          }`}
        />
        <span className="text-pretty">
          {fence.ok
            ? `At ${cart.name} — ${formatDistance(fence.distanceM ?? 0)} from the pin.`
            : geo.status === "locating"
              ? "Getting your location…"
              : (fence.reason ?? "Location unavailable.")}
        </span>
        {geo.status === "denied" && (
          <button onClick={geo.retry} className="ml-auto shrink-0 text-xs underline">
            retry
          </button>
        )}
      </div>

      {/* Camera ---------------------------------------------------------- */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black/90">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: preview, not a remote asset
          <img
            src={shot.previewUrl}
            alt="The photo that will be attached to this punch"
            className="h-full w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            // Mirrored for the viewer only; the saved frame is not flipped.
            style={{ transform: "scaleX(-1)" }}
          />
        )}

        {!shot && phase.kind !== "live" && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/70">
            {phase.kind === "starting" ? "Starting camera…" : "Camera is off"}
          </div>
        )}
      </div>

      {nextKind === "in" && !shot && (
        <p className="text-xs text-muted text-pretty">
          Stand back far enough that your cap and apron are in frame — the uniform
          check reads this photo.
        </p>
      )}

      {/* Actions --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        {shot ? (
          <>
            <button
              onClick={submit}
              disabled={busy || !fence.ok}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Recording…" : LABEL[nextKind]}
            </button>
            <button
              onClick={retake}
              disabled={busy}
              className="rounded-full border border-border px-5 py-2.5 text-sm transition hover:bg-surface-muted disabled:opacity-50"
            >
              Retake
            </button>
          </>
        ) : phase.kind === "live" ? (
          <button
            onClick={capture}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
          >
            Take photo
          </button>
        ) : (
          <button
            onClick={startCamera}
            disabled={!fence.ok}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            title={fence.ok ? undefined : "You have to be at the cart to punch."}
          >
            {LABEL[nextKind]}
          </button>
        )}
      </div>

      {phase.kind === "error" && (
        <p className="rounded-lg bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-[color:var(--danger)]">
          {phase.message}
        </p>
      )}
      {phase.kind === "done" && (
        <p className="rounded-lg bg-[color:var(--success)]/10 px-4 py-3 text-sm text-[color:var(--success)]">
          {phase.message}
        </p>
      )}

      {/* Today ----------------------------------------------------------- */}
      <div className="rounded-2xl border border-border p-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Today</p>
        {events.length === 0 ? (
          <p className="mt-2.5 text-sm text-muted">No punches yet.</p>
        ) : (
          <ul className="mt-2.5 space-y-3">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: AttendanceEvent }) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">
          {event.kind === "in" ? "Checked in" : "Checked out"}
        </span>
        <span className="flex items-baseline gap-2.5 text-muted">
          {event.lateByMinutes ? (
            <span className="text-[color:var(--danger)]">{event.lateByMinutes}m late</span>
          ) : null}
          {event.earlyByMinutes ? (
            <span className="text-[color:var(--danger)]">{event.earlyByMinutes}m early</span>
          ) : null}
          {/*
            Rendered in the server's zone on the server and the viewer's in the
            browser. Local time is what matters here, so the mismatch is
            suppressed rather than forcing everyone to UTC.
          */}
          <time dateTime={event.happenedAt} suppressHydrationWarning>
            {new Date(event.happenedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </span>
      </div>
      {event.dressCheck && <DressCheckLine check={event.dressCheck} />}
    </li>
  );
}

/** Stable order, and the wording staff see. */
const ITEM_LABELS: Array<[string, string]> = [
  ["cap", "cap"],
  ["apron", "apron"],
  ["shirt", "shirt"],
  ["logo", "logo"],
];

function itemsIn(check: DressCheck, state: string): string[] {
  return ITEM_LABELS.filter(([key]) => check.items?.[key] === state).map(
    ([, label]) => label,
  );
}

function DressCheckLine({ check }: { check: DressCheck }) {
  if (check.status === "skipped") return null;

  if (check.status === "queued" || check.status === "running") {
    return <p className="text-xs text-muted">Uniform check running…</p>;
  }

  if (check.status === "failed") {
    return (
      <p className="text-xs text-muted">
        Uniform check could not complete. A manager will review the photo.
      </p>
    );
  }

  const missing = itemsIn(check, "n");
  const unclear = itemsIn(check, "?");

  const tone =
    check.verdict === "pass"
      ? "text-[color:var(--success)]"
      : check.verdict === "fail"
        ? "text-[color:var(--danger)]"
        : "text-muted";

  const detail =
    check.verdict === "pass"
      ? "Uniform OK"
      : check.verdict === "fail"
        ? missing.length > 0
          ? `No ${missing.join(", no ")}`
          : "Below the pass mark"
        : `Could not tell${unclear.length > 0 ? ` — ${unclear.join(", ")} unclear` : ""}`;

  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 text-xs ${tone}`}>
      {check.score !== null && (
        <span className="rounded-full bg-current/10 px-2 py-0.5 font-medium tabular-nums">
          {check.score}/100
        </span>
      )}
      <span className="text-pretty">
        {detail}
        {check.verdict !== "pass" && check.reason && ` — ${check.reason}`}
      </span>
    </p>
  );
}
