"use client";

import { Camera, Eye, RotateCcw, ShieldCheck, Upload } from "lucide-react";

import { PUNCH_LABEL, type PunchKind } from "@/lib/attendance/types";

import type { Phase } from "./phase";

/**
 * The buttons under the viewfinder, and the hands-free toggle above them.
 *
 * Which buttons exist is a function of the phase, not of a pile of `disabled`
 * flags: there is no "capture" to grey out before the camera is open, and no
 * "confirm" until there is something to confirm.
 */
export function PunchActions({
  phase,
  hasShot,
  canPunch,
  nextKind,
  onStart,
  onCapture,
  onSubmit,
  onRetake,
  onBrowse,
}: {
  phase: Phase;
  hasShot: boolean;
  canPunch: boolean;
  nextKind: PunchKind;
  onStart: () => void;
  onCapture: () => void;
  onSubmit: () => void;
  onRetake: () => void;
  onBrowse: () => void;
}) {
  const busy = phase.kind === "submitting";

  // A photo is waiting: send it, replace it, or start over.
  if (hasShot) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={busy || !canPunch}
          className="btn btn-primary flex-1 py-3 text-base shadow-md sm:flex-initial"
        >
          <ShieldCheck className="h-4 w-4" />
          <span>{busy ? "Analyzing…" : `Confirm ${PUNCH_LABEL[nextKind]}`}</span>
        </button>
        <button onClick={onRetake} disabled={busy} className="btn btn-ghost py-3">
          <RotateCcw className="h-4 w-4" />
          <span>Change / Retake</span>
        </button>
        <button
          type="button"
          onClick={onBrowse}
          disabled={busy || !canPunch}
          className="btn btn-ghost py-3 text-xs sm:text-sm text-muted hover:text-foreground"
        >
          <Upload className="h-4 w-4" />
          <span>Upload different photo</span>
        </button>
      </div>
    );
  }

  // The camera is open and framing.
  if (phase.kind === "live") {
    return (
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          onClick={onCapture}
          className="btn btn-primary flex-1 py-3.5 text-base"
        >
          <Camera className="h-5 w-5" />
          <span>Capture photo</span>
        </button>
        <button type="button" onClick={onBrowse} className="btn btn-ghost py-3.5 text-sm">
          <Upload className="h-4 w-4" />
          <span>Upload file instead</span>
        </button>
      </div>
    );
  }

  // Nothing started yet. Both routes to a photo are offered side by side.
  const blockedReason = canPunch ? undefined : "You must be at the cart to punch.";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        onClick={onStart}
        disabled={!canPunch}
        title={blockedReason}
        className="btn btn-primary w-full py-3.5 text-sm sm:text-base"
      >
        <Camera className="h-5 w-5" />
        <span>
          {phase.kind === "rejected"
            ? "Try camera again"
            : `Open Camera (${PUNCH_LABEL[nextKind]})`}
        </span>
      </button>

      <button
        type="button"
        onClick={onBrowse}
        disabled={!canPunch}
        title={blockedReason}
        className="btn btn-secondary w-full py-3.5 text-sm sm:text-base border border-border bg-surface hover:bg-surface-muted"
      >
        <Upload className="h-5 w-5 text-accent" />
        <span>Upload photo</span>
      </button>
    </div>
  );
}

/**
 * Opt-in hands-free capture.
 *
 * The preference is remembered per device rather than per account: it is about
 * whether this phone's camera can see the worker's face well enough, which has
 * nothing to do with who is signed in.
 */
export function BlinkToggle({
  enabled,
  armed,
  onChange,
}: {
  enabled: boolean;
  armed: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 text-sm transition hover:border-border cursor-pointer">
      <div className="mt-0.5 grid h-6 w-6 place-items-center rounded-lg bg-accent-soft text-accent">
        <Eye className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-xs text-foreground sm:text-sm">
            Blink to Capture 👁️
          </span>
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
