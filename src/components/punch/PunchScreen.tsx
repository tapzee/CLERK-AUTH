"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Clock,
  Eye,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { checkGeofence, formatDistance } from "@/lib/attendance/geofence";
import type { AttendanceStatus, PunchKind } from "@/lib/attendance/types";
import type { CaptureMethod } from "@/lib/geo";
import { captureFrame, shrinkImageFile } from "@/lib/image";
import { isFixFresh, useGeolocation } from "@/lib/hooks/useGeolocation";
import { useBlinkCapture, type BlinkState } from "@/lib/hooks/useBlinkCapture";
import { usePersistedBoolean } from "@/lib/hooks/usePersistedBoolean";
import { ITEM_NOUNS, ITEM_KEYS, type ItemGrade } from "@/lib/uniform/items";
import { Card, Dot, Pill } from "@/components/ui/primitives";

import { TodaysPunches } from "./TodaysPunches";

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "review" }
  | { kind: "submitting" }
  | { kind: "rejected"; message: string; grades: Record<string, string> | null }
  | { kind: "done"; message: string; tone: "success" | "warning" }
  | { kind: "error"; message: string };

type Shot = {
  previewUrl: string;
  blob: Blob;
  width: number;
  height: number;
  method: CaptureMethod;
  source?: "camera" | "upload";
  capturedAt?: string;
};

const LABEL: Record<PunchKind, string> = { in: "Check in", out: "Check out" };

const VERDICT_POLL_MS = 2500;
const VERDICT_POLL_LIMIT = 8;

const BLINK_PREFERENCE_KEY = "shift:blink-to-capture";

export function PunchScreen({ status }: { status: AttendanceStatus }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [shot, setShot] = useState<Shot | null>(null);
  const [polls, setPolls] = useState(0);
  const [blinkEnabled, toggleBlink] = usePersistedBoolean(BLINK_PREFERENCE_KEY);
  const [isDragging, setIsDragging] = useState(false);

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
        message: "This browser has no camera API. Camera access needs HTTPS or localhost. You can still use the Upload Photo option.",
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
            ? "Camera permission was denied. Allow it in your browser settings or use the Upload Photo option below."
            : "Could not start the camera. Try again or upload an image directly.",
      });
    }
  }, [stopStream]);

  const capture = useCallback(
    async (method: CaptureMethod = "manual") => {
      const video = videoRef.current;
      if (!video) return;

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
        method,
        source: "camera",
        capturedAt: new Date().toISOString(),
      });
      setPhase({ kind: "review" });
    },
    [stopStream],
  );

  const captureOnBlink = useCallback(() => {
    void capture("blink");
  }, [capture]);

  const blink = useBlinkCapture({
    videoRef,
    enabled: blinkEnabled && phase.kind === "live",
    onTrigger: captureOnBlink,
  });

  const processSelectedFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setPhase({
          kind: "error",
          message: "Please select a valid image file (JPG, PNG, or WebP).",
        });
        return;
      }

      if (file.size > 15 * 1024 * 1024) {
        setPhase({
          kind: "error",
          message: "The selected image is too large (max 15 MB).",
        });
        return;
      }

      stopStream();
      setPhase({ kind: "starting" });

      try {
        let processedFile: File = file;
        let width = 1280;
        let height = 720;

        try {
          processedFile = await shrinkImageFile(file);
          const bitmap = await createImageBitmap(processedFile);
          width = bitmap.width;
          height = bitmap.height;
          bitmap.close();
        } catch {
          try {
            const bitmap = await createImageBitmap(file);
            width = bitmap.width;
            height = bitmap.height;
            bitmap.close();
          } catch {
            // Default dimensions
          }
        }

        if (shot) URL.revokeObjectURL(shot.previewUrl);

        const previewUrl = URL.createObjectURL(processedFile);
        setShot({
          previewUrl,
          blob: processedFile,
          width,
          height,
          method: "manual",
          source: "upload",
          capturedAt: new Date().toISOString(),
        });
        setPhase({ kind: "review" });
      } catch {
        setPhase({
          kind: "error",
          message: "Could not process this image. Please try another photo.",
        });
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [shot, stopStream],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void processSelectedFile(file);
      }
    },
    [processSelectedFile],
  );

  const triggerUpload = useCallback(() => {
    stopStream();
    fileInputRef.current?.click();
  }, [stopStream]);

  const retake = useCallback(() => {
    if (shot) URL.revokeObjectURL(shot.previewUrl);
    const wasCamera = shot?.source === "camera";
    setShot(null);
    if (wasCamera) {
      void startCamera();
    } else {
      setPhase({ kind: "idle" });
    }
  }, [shot, startCamera]);

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
    form.append("capturedAt", shot.capturedAt ?? new Date().toISOString());
    form.append("captureMethod", shot.method);

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

      {/* Hidden file input for uploading an image */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Futuristic Viewfinder HUD */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (fence.ok) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!fence.ok) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void processSelectedFile(file);
        }}
        className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-neutral-950 shadow-2xl transition-all duration-200 sm:aspect-[4/3] ${
          isDragging ? "border-accent ring-2 ring-accent/40" : "border-border/80"
        }`}
      >
        {/* HUD Corner Brackets */}
        <div className="pointer-events-none absolute inset-4 z-10">
          <div className="absolute top-0 left-0 h-4 w-4 border-t-2 border-l-2 border-white/50 rounded-tl" />
          <div className="absolute top-0 right-0 h-4 w-4 border-t-2 border-r-2 border-white/50 rounded-tr" />
          <div className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-white/50 rounded-bl" />
          <div className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-white/50 rounded-br" />
        </div>

        {/* Drag & Drop Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-accent/20 px-6 text-center backdrop-blur-md border-2 border-dashed border-accent">
            <div className="space-y-2">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-white shadow-lg animate-bounce">
                <Upload className="h-7 w-7" />
              </div>
              <p className="text-base font-bold text-white">Drop image to check in</p>
              <p className="text-xs text-white/80">Release to verify uniform with Vision AI</p>
            </div>
          </div>
        )}

        {shot ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview */}
            <img
              src={shot.previewUrl}
              alt="Check-in preview"
              className="h-full w-full object-contain"
            />
            <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md border border-white/10 shadow-sm">
              {shot.source === "upload" ? (
                <>
                  <Upload className="h-3 w-3 text-accent" />
                  <span>Uploaded photo</span>
                </>
              ) : (
                <>
                  <Camera className="h-3 w-3 text-accent" />
                  <span>Live capture</span>
                </>
              )}
            </div>
          </>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        )}

        {/* Live scanning line effect */}
        {phase.kind === "live" && !shot && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-75 animate-scanline" />
        )}

        {!shot && phase.kind !== "live" && (
          <div
            onClick={() => {
              if (fence.ok && phase.kind === "idle") {
                triggerUpload();
              }
            }}
            className={`absolute inset-0 grid place-items-center bg-black/40 px-6 text-center backdrop-blur-[2px] ${
              fence.ok && phase.kind === "idle" ? "cursor-pointer transition hover:bg-black/30" : ""
            }`}
          >
            <div className="space-y-3">
              <div className="mx-auto flex items-center justify-center gap-2.5">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white/90 backdrop-blur-md shadow-sm">
                  <Camera className="h-6 w-6" />
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent backdrop-blur-md shadow-sm">
                  <Upload className="h-6 w-6" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white/90">
                  {phase.kind === "starting"
                    ? "Starting camera / loading photo…"
                    : fence.ok
                      ? `Ready to ${LABEL[nextKind].toLowerCase()}`
                      : "Camera & upload unlock once you are at the cart"}
                </p>
                <p className="text-xs text-white/70">
                  {fence.ok
                    ? "Take a photo or upload an image (cap & apron must be visible)"
                    : "Move within the cart radius"}
                </p>
              </div>
              {fence.ok && phase.kind === "idle" && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[11px] font-medium text-white/80">
                  <Upload className="h-3 w-3 text-accent" />
                  <span>Click to browse photo, or choose below</span>
                </div>
              )}
            </div>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 px-6 text-center backdrop-blur-md z-20">
            <div className="space-y-3">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/20 text-accent">
                <ShieldCheck className="h-6 w-6 animate-pulse" />
              </div>
              <p className="text-sm font-semibold text-white">Analyzing Uniform with Vision AI…</p>
              <p className="text-xs text-white/70">Verifying apron, cap, and logo in real-time</p>
            </div>
          </div>
        )}

        {!shot && phase.kind === "live" && blinkEnabled && (
          <BlinkOverlay blink={blink} />
        )}
      </div>

      {nextKind === "in" && !shot && phase.kind !== "rejected" && (
        <p className="text-xs text-muted text-pretty">
          💡 Stand back far enough that your cap and apron are in frame — the uniform
          check reads this photo.
        </p>
      )}

      {!shot && (phase.kind === "idle" || phase.kind === "live") && (
        <BlinkToggle enabled={blinkEnabled} onChange={toggleBlink} armed={phase.kind === "live"} />
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
        onUploadClick={triggerUpload}
      />

      {phase.kind === "error" && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft p-4 text-xs font-medium text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{phase.message}</span>
        </div>
      )}
      {phase.kind === "done" && (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-xl p-4 text-xs font-medium ${
            phase.tone === "success"
              ? "border border-success/30 bg-success-soft text-success"
              : "border border-warning/30 bg-warning-soft text-warning"
          }`}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{phase.message}</span>
        </div>
      )}

      <TodaysPunches events={events} />
    </div>
  );
}

function confirmation(
  kind: PunchKind,
  event: { lateByMinutes?: number | null; isLate?: boolean } | undefined,
): { message: string; tone: "success" | "warning" } {
  if (kind === "out") {
    return { message: "Checked out successfully. Have a great evening!", tone: "success" };
  }

  if (event?.isLate) {
    return {
      message: `Checked in — marked late by ${event.lateByMinutes} minutes.`,
      tone: "warning",
    };
  }

  return {
    message: event?.lateByMinutes
      ? `Checked in on time — ${event.lateByMinutes}m after shift start, within your grace allowance.`
      : "Checked in on time. Uniform verified!",
    tone: "success",
  };
}

function WorkerCard({ worker }: { worker: AttendanceStatus["worker"] }) {
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
            {worker.shiftEnd ? ` – ${worker.shiftEnd.slice(0, 5)}` : ""} · {worker.graceMinutes}m grace
          </span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">No scheduled shift — lateness not docked.</p>
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
      <div className="flex items-center gap-2 text-danger font-semibold text-sm">
        <AlertTriangle className="h-4 w-4" />
        <span>{phase.message}</span>
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {problems.map((item) => (
            <li key={item.key}>
              <Pill tone="danger">
                {item.grade === "n"
                  ? `Missing ${ITEM_NOUNS[item.key]}`
                  : `${ITEM_NOUNS[item.key]} not worn correctly`}
              </Pill>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-danger/80 text-pretty">
        Adjust your uniform and retake or upload a new photo to complete your check-in.
      </p>
    </div>
  );
}

function Actions({
  phase,
  hasShot,
  canPunch,
  nextKind,
  onStart,
  onCapture,
  onSubmit,
  onRetake,
  onUploadClick,
}: {
  phase: Phase;
  hasShot: boolean;
  canPunch: boolean;
  nextKind: PunchKind;
  onStart: () => void;
  onCapture: () => void;
  onSubmit: () => void;
  onRetake: () => void;
  onUploadClick: () => void;
}) {
  const busy = phase.kind === "submitting";

  if (hasShot) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={busy || !canPunch}
          className="btn btn-primary flex-1 py-3 text-base shadow-md sm:flex-initial"
        >
          <ShieldCheck className="h-4 w-4" />
          <span>{busy ? "Analyzing…" : `Confirm ${LABEL[nextKind]}`}</span>
        </button>
        <button
          onClick={onRetake}
          disabled={busy}
          className="btn btn-ghost py-3"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Change / Retake</span>
        </button>
        <button
          type="button"
          onClick={onUploadClick}
          disabled={busy || !canPunch}
          className="btn btn-ghost py-3 text-xs sm:text-sm text-muted hover:text-foreground"
        >
          <Upload className="h-4 w-4" />
          <span>Upload different photo</span>
        </button>
      </div>
    );
  }

  if (phase.kind === "live") {
    return (
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          onClick={() => onCapture()}
          className="btn btn-primary flex-1 py-3.5 text-base shadow-lg shadow-accent/20"
        >
          <Camera className="h-5 w-5" />
          <span>Capture photo</span>
        </button>
        <button
          type="button"
          onClick={onUploadClick}
          className="btn btn-ghost py-3.5 text-sm"
        >
          <Upload className="h-4 w-4" />
          <span>Upload file instead</span>
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        onClick={onStart}
        disabled={!canPunch}
        title={canPunch ? undefined : "You must be at the cart to punch."}
        className="btn btn-primary w-full py-3.5 text-sm sm:text-base shadow-lg shadow-accent/20"
      >
        <Camera className="h-5 w-5" />
        <span>{phase.kind === "rejected" ? "Try camera again" : `Open Camera (${LABEL[nextKind]})`}</span>
      </button>

      <button
        type="button"
        onClick={onUploadClick}
        disabled={!canPunch}
        title={canPunch ? undefined : "You must be at the cart to punch."}
        className="btn btn-secondary w-full py-3.5 text-sm sm:text-base border border-border/80 bg-surface-glass hover:bg-surface-muted"
      >
        <Upload className="h-5 w-5 text-accent" />
        <span>Upload photo</span>
      </button>
    </div>
  );
}

function BlinkToggle({
  enabled,
  armed,
  onChange,
}: {
  enabled: boolean;
  armed: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-border/80 bg-surface-glass p-3.5 text-sm transition hover:border-border cursor-pointer">
      <div className="mt-0.5 grid h-6 w-6 place-items-center rounded-lg bg-accent-soft text-accent">
        <Eye className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-xs text-foreground sm:text-sm">Blink to Capture 👁️</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onChange(event.target.checked)}
            className="h-4 w-4 accent-accent rounded cursor-pointer"
          />
        </div>
        <p className="mt-0.5 text-xs text-muted text-pretty">
          {enabled && !armed
            ? "Ready — open camera and hold your eyes shut for 1s to capture automatically."
            : "Hold eyes shut for 1 second and the camera captures on open."}
        </p>
      </div>
    </label>
  );
}

function BlinkOverlay({ blink }: { blink: BlinkState }) {
  const label =
    blink.status === "loading"
      ? "Loading face detection model…"
      : blink.status === "error"
        ? (blink.error ?? "Blink detection unavailable — use the button")
        : blink.cooling
          ? "Captured! Processing photo…"
          : !blink.faceDetected
            ? "Looking for your face…"
            : blink.holdProgress > 0
              ? "Hold eyes closed…"
              : "Ready — hold eyes shut to capture";

  return (
    <div className="absolute inset-x-4 bottom-4 space-y-2 z-20">
      <div className="flex items-center justify-between rounded-full bg-black/75 px-4 py-2 text-xs text-white backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-2">
          <Dot tone={blink.faceDetected ? "success" : "neutral"} pulse={blink.faceDetected} />
          <span className="font-medium">{label}</span>
        </div>
        {blink.faceDetected && (
          <span className="font-mono text-[10px] text-white/70">AI Locked</span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/20 backdrop-blur">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-accent transition-all duration-100 ease-out"
          style={{ width: `${Math.round(blink.holdProgress * 100)}%` }}
        />
      </div>
    </div>
  );
}

