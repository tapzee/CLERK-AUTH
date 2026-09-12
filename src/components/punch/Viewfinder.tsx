"use client";

import { useState, type RefObject } from "react";
import { Camera, ShieldCheck, Upload } from "lucide-react";

import { PUNCH_LABEL, type PunchKind } from "@/lib/attendance/types";
import type { BlinkState } from "@/lib/hooks/useBlinkCapture";
import type { Shot } from "@/lib/hooks/useSelfieCapture";
import { Dot } from "@/components/ui/primitives";

import type { Phase } from "./phase";

/**
 * The camera box: live feed, frozen preview, and every overlay that explains
 * what the screen is waiting for.
 *
 * All three ways of supplying a photo converge here — the shutter, the file
 * picker and a dropped file — and each of them is gated on `canPunch`, because
 * a photo taken away from the cart is only going to be refused by the server.
 */
export function Viewfinder({
  videoRef,
  shot,
  phase,
  canPunch,
  nextKind,
  blink,
  blinkEnabled,
  onDropFile,
  onBrowse,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  shot: Shot | null;
  phase: Phase;
  canPunch: boolean;
  nextKind: PunchKind;
  blink: BlinkState;
  blinkEnabled: boolean;
  onDropFile: (file: File) => void;
  onBrowse: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const busy = phase.kind === "submitting";

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (canPunch) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (!canPunch) return;
        const file = event.dataTransfer.files?.[0];
        if (file) onDropFile(file);
      }}
      className={`relative aspect-[3/4] w-full overflow-hidden rounded-3xl border bg-neutral-950 shadow-2xl transition-all duration-300 sm:aspect-[4/3] ${
        isDragging ? "border-accent ring-4 ring-accent/30" : "border-border/80 shadow-accent/5"
      }`}
    >
      {/* High-Tech Biometric HUD corner brackets */}
      <div className="pointer-events-none absolute inset-4 z-10 sm:inset-6">
        <div className="absolute top-0 left-0 h-5 w-5 border-t-2 border-l-2 border-accent rounded-tl shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
        <div className="absolute top-0 right-0 h-5 w-5 border-t-2 border-r-2 border-accent rounded-tr shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
        <div className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-accent rounded-bl shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
        <div className="absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2 border-accent rounded-br shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
      </div>

      {/* Face Placement Target Guide (Visible during live framing) */}
      {phase.kind === "live" && !shot && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
          <div
            className={`h-48 w-36 sm:h-56 sm:w-44 rounded-[40%] border-2 border-dashed transition-colors duration-300 ${
              blink.faceDetected
                ? "border-emerald-400/80 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "border-white/30 bg-black/10"
            }`}
          />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-white/70 bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
            {blink.faceDetected ? "✓ Face Locked & In Focus" : "Align face, cap & apron"}
          </p>
        </div>
      )}

      {isDragging && <DropTarget />}

      {shot ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview */}
          <img
            src={shot.previewUrl}
            alt="Check-in preview"
            className="h-full w-full object-contain"
          />
          <SourceBadge source={shot.source} />
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

      {phase.kind === "live" && !shot && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-90 animate-laser" />
      )}

      {!shot && phase.kind !== "live" && (
        <StandbyOverlay
          phase={phase}
          canPunch={canPunch}
          nextKind={nextKind}
          onBrowse={onBrowse}
        />
      )}

      {busy && <AnalysingOverlay />}

      {!shot && phase.kind === "live" && blinkEnabled && <BlinkOverlay blink={blink} />}
    </div>
  );
}

function DropTarget() {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-accent/20 px-6 text-center backdrop-blur-md border-2 border-dashed border-accent">
      <div className="space-y-2">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-white shadow-lg animate-bounce">
          <Upload className="h-7 w-7" />
        </div>
        <p className="text-base font-bold text-white">Drop image to check in</p>
        <p className="text-xs text-white/80">Release to verify uniform with Vision AI</p>
      </div>
    </div>
  );
}

/** Says whether the frame on screen was taken here or picked from the device. */
function SourceBadge({ source }: { source: Shot["source"] }) {
  const Icon = source === "upload" ? Upload : Camera;

  return (
    <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md border border-white/15 shadow-md">
      <Icon className="h-3 w-3 text-accent" />
      <span>{source === "upload" ? "Uploaded photo" : "Live capture"}</span>
    </div>
  );
}

/**
 * What fills the box before the camera is open.
 *
 * The whole panel is the browse target once a punch is possible, because on a
 * phone it is a far bigger tap area than the button underneath.
 */
function StandbyOverlay({
  phase,
  canPunch,
  nextKind,
  onBrowse,
}: {
  phase: Phase;
  canPunch: boolean;
  nextKind: PunchKind;
  onBrowse: () => void;
}) {
  const browsable = canPunch && phase.kind === "idle";

  return (
    <div
      onClick={() => {
        if (browsable) onBrowse();
      }}
      className={`absolute inset-0 grid place-items-center bg-black/40 px-6 text-center backdrop-blur-[2px] ${
        browsable ? "cursor-pointer transition hover:bg-black/30" : ""
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
              : canPunch
                ? `Ready to ${PUNCH_LABEL[nextKind].toLowerCase()}`
                : "Camera & upload unlock once you are at the cart"}
          </p>
          <p className="text-xs text-white/70">
            {canPunch
              ? "Take a photo or upload an image (cap & apron must be visible)"
              : "Move within the cart radius"}
          </p>
        </div>
        {browsable && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[11px] font-medium text-white/80">
            <Upload className="h-3 w-3 text-accent" />
            <span>Click to browse photo, or choose below</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysingOverlay() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/75 px-6 text-center backdrop-blur-md z-20">
      <div className="space-y-3">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/20 text-accent">
          <ShieldCheck className="h-6 w-6 animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-white">Analyzing Uniform with Vision AI…</p>
        <p className="text-xs text-white/70">Verifying apron, cap, and logo in real-time</p>
      </div>
    </div>
  );
}

/** Progress and coaching for hands-free capture, shown only while it is armed. */
function BlinkOverlay({ blink }: { blink: BlinkState }) {
  return (
    <div className="absolute inset-x-4 bottom-4 space-y-2 z-20">
      <div className="flex items-center justify-between rounded-full bg-black/75 px-4 py-2 text-xs text-white backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-2">
          <Dot tone={blink.faceDetected ? "success" : "neutral"} pulse={blink.faceDetected} />
          <span className="font-medium">{blinkHint(blink)}</span>
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

function blinkHint(blink: BlinkState): string {
  if (blink.status === "loading") return "Loading face detection model…";
  if (blink.status === "error") {
    return blink.error ?? "Blink detection unavailable — use the button";
  }
  if (blink.cooling) return "Captured! Processing photo…";
  if (!blink.faceDetected) return "Looking for your face…";
  return blink.holdProgress > 0 ? "Hold eyes closed…" : "Ready — hold eyes shut to capture";
}
