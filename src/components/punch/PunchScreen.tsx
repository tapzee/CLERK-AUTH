"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { checkGeofence, formatDistance } from "@/lib/attendance/geofence";
import type { AttendanceStatus, PunchKind } from "@/lib/attendance/types";
import { captureFrame } from "@/lib/image";
import { isFixFresh, useGeolocation } from "@/lib/hooks/useGeolocation";
import { ITEM_NOUNS, ITEM_KEYS, type ItemGrade } from "@/lib/uniform/items";
import { Card, Dot, Pill } from "@/components/ui/primitives";

import { TodaysPunches } from "./TodaysPunches";

/**
 * Sign in, stand at the cart, take a selfie. That is the whole worker-facing
 * product.
 *
 * The one thing that makes this more than a camera is the refusal path: a
 * check-in that fails the uniform check never becomes a punch, so the screen
 * has to say exactly what is wrong and put the camera straight back up.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "review" }
  | { kind: "submitting" }
  | { kind: "rejected"; message: string; grades: Record<string, string> | null }
  | { kind: "done"; message: string; tone: "success" | "warning" }
  | { kind: "error"; message: string };

type Shot = { previewUrl: string; blob: Blob; width: number; height: number };

const LABEL: Record<PunchKind, string> = { in: "Check in", out: "Check out" };

/** How long to keep re-asking the server while a verdict is still pending. */
const VERDICT_POLL_MS = 2500;
const VERDICT_POLL_LIMIT = 8;

export function PunchScreen({ status }: { status: AttendanceStatus }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [shot, setShot] = useState<Shot | null>(null);
  const [polls, setPolls] = useState(0);

  // Watched for the whole page, not just while the camera is open, so the
  // geofence verdict is already settled by the time the shutter fires.
  const geo = useGeolocation(true);

  const { worker, events, nextKind } = status;
  const cart = worker.cart;

  const fresh = geo.fix && isFixFresh(geo.fix) ? geo.fix : null;
  const fence = checkGeofence(
    fresh && {
      latitude: fresh.latitude,
      longitude: fresh.longitude,
      accuracyM: fresh.accuracyM,
    },
    cart,
  );

  // A verdict that could not be settled inline lands a second or two later, on
  // a background worker. Rather than hold the request open for it, the page
  // asks again until it settles, then stops.
  const awaitingVerdict = events.some((event) =>
    ["queued", "running", "failed"].includes(event.dressCheck?.status ?? ""),
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

      if (response.status === 422 && body.uniform) {
        // The uniform check refused it. The photo is dropped and the camera
        // goes straight back up -- the whole point is that they fix it and
        // try again, not that they read an error and wonder what to do.
        URL.revokeObjectURL(shot.previewUrl);
        setShot(null);
        setPhase({
          kind: "rejected",
          message: body.error ?? "You are not in full uniform.",
          grades: body.uniform.grades ?? null,
        });
        return;
      }

      if (!response.ok) {
        setPhase({ kind: "error", message: body.error ?? "Could not record the punch." });
        return;
      }

      URL.revokeObjectURL(shot.previewUrl);
      setShot(null);
      setPolls(0);
      setPhase({ kind: "done", ...confirmation(nextKind, body.event) });
      router.refresh();
    } catch {
      setPhase({ kind: "error", message: "Network error. Check your connection and retry." });
    }
  }, [fresh, geo.error, nextKind, router, shot]);

  const busy = phase.kind === "submitting";

  return (
    <div className="space-y-4">
      <WorkerCard worker={worker} />
      <GeofenceBar fence={fence} cartName={cart.name} geo={geo} />

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black/90 sm:aspect-[4/3]">
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

        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center">
            <div>
              <p className="text-sm font-medium text-white">Checking your uniform…</p>
              <p className="mt-1 text-xs text-white/70">This takes a couple of seconds.</p>
            </div>
          </div>
        )}
      </div>

      {nextKind === "in" && !shot && phase.kind !== "rejected" && (
        <p className="text-xs text-muted text-pretty">
          Stand back far enough that your cap and apron are in frame — the uniform
          check reads this photo.
        </p>
      )}

      {phase.kind === "rejected" && <RejectionNotice phase={phase} />}

      <Actions
        phase={phase}
        hasShot={!!shot}
        canPunch={fence.ok}
        nextKind={nextKind}
        onStart={startCamera}
        onCapture={capture}
        onSubmit={submit}
        onRetake={retake}
      />

      {phase.kind === "error" && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {phase.message}
        </p>
      )}
      {phase.kind === "done" && (
        <p
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            phase.tone === "success"
              ? "bg-success-soft text-success"
              : "bg-warning-soft text-warning"
          }`}
        >
          {phase.message}
        </p>
      )}

      <TodaysPunches events={events} />
    </div>
  );
}

/** The sentence shown after a successful punch. */
function confirmation(
  kind: PunchKind,
  event: { lateByMinutes?: number | null; isLate?: boolean } | undefined,
): { message: string; tone: "success" | "warning" } {
  if (kind === "out") {
    return { message: "Checked out. See you tomorrow.", tone: "success" };
  }

  if (event?.isLate) {
    return {
      message: `Checked in — marked late by ${event.lateByMinutes} minutes.`,
      tone: "warning",
    };
  }

  // Inside the grace window still counts as on time, which is worth saying so
  // nobody thinks a few minutes cost them.
  return {
    message: event?.lateByMinutes
      ? `Checked in on time — ${event.lateByMinutes} min after your shift start, inside your grace window.`
      : "Checked in on time.",
    tone: "success",
  };
}

function WorkerCard({ worker }: { worker: AttendanceStatus["worker"] }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium">{worker.fullName}</p>
        <p className="text-sm text-muted">{worker.cart.name}</p>
      </div>
      {worker.shiftStart ? (
        <p className="mt-1 text-xs text-muted">
          Shift {worker.shiftStart.slice(0, 5)}
          {worker.shiftEnd ? ` – ${worker.shiftEnd.slice(0, 5)}` : ""} · late after{" "}
          {worker.graceMinutes} min
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">No shift set — nothing is counted late.</p>
      )}
    </Card>
  );
}

function GeofenceBar({
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
      className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm ${
        fence.ok ? "border-success/30 bg-success-soft" : "border-border bg-surface-muted"
      }`}
    >
      <Dot tone={fence.ok ? "success" : "neutral"} />
      <span className="text-pretty">
        {fence.ok
          ? `At ${cartName} — ${formatDistance(fence.distanceM ?? 0)} from the pin.`
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
  );
}

/** What was wrong, item by item, so there is nothing to guess at. */
function RejectionNotice({
  phase,
}: {
  phase: Extract<Phase, { kind: "rejected" }>;
}) {
  const problems = ITEM_KEYS.map((key) => ({
    key,
    grade: (phase.grades?.[key] ?? "?") as ItemGrade,
  })).filter((item) => item.grade === "n" || item.grade === "p");

  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-4">
      <p className="text-sm font-medium text-danger text-pretty">{phase.message}</p>

      {problems.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {problems.map((item) => (
            <li key={item.key}>
              <Pill tone="danger">
                {item.grade === "n"
                  ? `No ${ITEM_NOUNS[item.key]}`
                  : `${ITEM_NOUNS[item.key]} worn badly`}
              </Pill>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-danger/80 text-pretty">
        Nothing has been recorded. Fix your uniform and take the photo again.
      </p>
    </div>
  );
}

/** The one button that matters, in whichever state the screen is in. */
function Actions({
  phase,
  hasShot,
  canPunch,
  nextKind,
  onStart,
  onCapture,
  onSubmit,
  onRetake,
}: {
  phase: Phase;
  hasShot: boolean;
  canPunch: boolean;
  nextKind: PunchKind;
  onStart: () => void;
  onCapture: () => void;
  onSubmit: () => void;
  onRetake: () => void;
}) {
  const busy = phase.kind === "submitting";

  if (hasShot) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onSubmit} disabled={busy || !canPunch} className="btn btn-primary">
          {busy ? "Checking…" : LABEL[nextKind]}
        </button>
        <button onClick={onRetake} disabled={busy} className="btn btn-ghost">
          Retake
        </button>
      </div>
    );
  }

  if (phase.kind === "live") {
    return (
      <button onClick={onCapture} className="btn btn-primary w-full py-3 sm:w-auto">
        Take photo
      </button>
    );
  }

  return (
    <button
      onClick={onStart}
      disabled={!canPunch}
      title={canPunch ? undefined : "You have to be at the cart to punch."}
      className="btn btn-primary w-full py-3 sm:w-auto"
    >
      {phase.kind === "rejected" ? "Try again" : LABEL[nextKind]}
    </button>
  );
}
