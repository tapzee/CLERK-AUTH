"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { checkGeofence } from "@/lib/attendance/geofence";
import type { AttendanceStatus } from "@/lib/attendance/types";
import { isFixFresh, useGeolocation } from "@/lib/hooks/useGeolocation";
import { useBlinkCapture } from "@/lib/hooks/useBlinkCapture";
import { usePersistedBoolean } from "@/lib/hooks/usePersistedBoolean";
import { useSelfieCapture } from "@/lib/hooks/useSelfieCapture";

import { confirmation, type Phase } from "./phase";
import { GeofenceBar, WorkerCard } from "./PunchHeader";
import { Viewfinder } from "./Viewfinder";
import { BlinkToggle, PunchActions } from "./PunchActions";
import { DoneBanner, ErrorBanner, RejectionNotice } from "./PunchFeedback";
import { TodaysPunches } from "./TodaysPunches";

/**
 * The worker's whole screen: one photo, one punch.
 *
 * This file owns the decisions — is a punch allowed, what happened to the last
 * one — while the camera lives in `useSelfieCapture` and everything visible is
 * a component below. The order it enforces is the cheap-first order the server
 * repeats: no fix means no camera, and a photo the geofence would refuse is
 * never taken in the first place.
 */

/** How often the screen re-asks the server for a verdict, and how many times. */
const VERDICT_POLL_MS = 2500;
const VERDICT_POLL_LIMIT = 8;

const BLINK_PREFERENCE_KEY = "shift:blink-to-capture";

export function PunchScreen({ status }: { status: AttendanceStatus }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [polls, setPolls] = useState(0);
  const [blinkEnabled, toggleBlink] = usePersistedBoolean(BLINK_PREFERENCE_KEY);

  const geo = useGeolocation(true);
  const {
    videoRef,
    fileInputRef,
    shot,
    startCamera,
    takePhoto,
    acceptFile,
    openFilePicker,
    onFileInputChange,
    retake,
    clearShot,
  } = useSelfieCapture(setPhase);

  const { worker, events, nextKind } = status;
  const cart = worker.cart;

  // A stale fix is treated as no fix: a position from ten minutes ago says
  // nothing about where the phone is now.
  const fresh = geo.fix && isFixFresh(geo.fix) ? geo.fix : null;
  const fence = checkGeofence(
    fresh && {
      latitude: fresh.latitude,
      longitude: fresh.longitude,
      accuracyM: fresh.accuracyM,
    },
    cart,
  );

  /**
   * A punch was recorded without a settled uniform verdict.
   *
   * The catch-up worker will get to it eventually, but a worker standing at the
   * cart should not have to wait for a cron job, so the screen re-asks a few
   * times and then stops rather than polling all day.
   */
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

  const captureOnBlink = useCallback(() => {
    void takePhoto("blink");
  }, [takePhoto]);

  const blink = useBlinkCapture({
    videoRef,
    enabled: blinkEnabled && phase.kind === "live",
    onTrigger: captureOnBlink,
  });

  const submit = useCallback(async () => {
    if (!shot) return;
    setPhase({ kind: "submitting" });

    const form = new FormData();
    const filename =
      shot.blob instanceof File && shot.blob.name ? shot.blob.name : "punch.jpg";
    form.append("photo", shot.blob, filename);
    form.append("kind", nextKind);
    form.append("width", String(shot.width));
    form.append("height", String(shot.height));
    form.append("capturedAt", shot.capturedAt);
    form.append("captureMethod", shot.method);

    if (fresh) {
      form.append("latitude", String(fresh.latitude));
      form.append("longitude", String(fresh.longitude));
      form.append("accuracyM", String(fresh.accuracyM));
      if (fresh.altitudeM !== null) form.append("altitudeM", String(fresh.altitudeM));
    } else {
      // Sent so the row records *why* there is no position, not just that
      // there isn't one. The server refuses the punch either way.
      form.append("locationError", geo.error ?? "no fresh location fix");
    }

    try {
      const response = await fetch("/api/attendance", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));

      // 422 is the uniform check refusing the photo: nothing was recorded, and
      // the per-item grades say what to fix before trying again.
      if (response.status === 422 && body.uniform) {
        clearShot();
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

      clearShot();
      setPolls(0);
      setPhase({ kind: "done", ...confirmation(nextKind, body.event) });
      router.refresh();
    } catch {
      setPhase({
        kind: "error",
        message: "Network error. Check your connection and retry.",
      });
    }
  }, [clearShot, fresh, geo.error, nextKind, router, shot]);

  return (
    <div className="space-y-4">
      <WorkerCard worker={worker} />
      <GeofenceBar fence={fence} cartName={cart.name} geo={geo} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileInputChange}
      />

      <Viewfinder
        videoRef={videoRef}
        shot={shot}
        phase={phase}
        canPunch={fence.ok}
        nextKind={nextKind}
        blink={blink}
        blinkEnabled={blinkEnabled}
        onDropFile={(file) => void acceptFile(file)}
        onBrowse={openFilePicker}
      />

      {nextKind === "in" && !shot && phase.kind !== "rejected" && (
        <p className="text-xs text-muted text-pretty">
          💡 Stand back far enough that your cap and apron are in frame — the uniform
          check reads this photo.
        </p>
      )}

      {!shot && (phase.kind === "idle" || phase.kind === "live") && (
        <BlinkToggle
          enabled={blinkEnabled}
          onChange={toggleBlink}
          armed={phase.kind === "live"}
        />
      )}

      {phase.kind === "rejected" && <RejectionNotice phase={phase} />}

      <PunchActions
        phase={phase}
        hasShot={!!shot}
        canPunch={fence.ok}
        nextKind={nextKind}
        onStart={() => void startCamera()}
        onCapture={() => void takePhoto()}
        onSubmit={() => void submit()}
        onRetake={retake}
        onBrowse={openFilePicker}
      />

      {phase.kind === "error" && <ErrorBanner message={phase.message} />}
      {phase.kind === "done" && <DoneBanner message={phase.message} tone={phase.tone} />}

      <TodaysPunches events={events} />
    </div>
  );
}
