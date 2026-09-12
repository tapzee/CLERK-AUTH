import type { Role } from "@/lib/auth/rbac";

/**
 * The attendance vocabulary shared between the browser and the server.
 *
 * Must stay free of any `server-only` import: the punch screen and the console
 * tables both render these shapes.
 */

/** A punch is either the start or the end of a shift. */
export type PunchKind = "in" | "out";

/** How the selfie was taken: by pressing the button, or by blinking. */
export type CaptureMethod = "manual" | "blink";

/** What to call each punch on a button or a badge. */
export const PUNCH_LABEL: Record<PunchKind, string> = {
  in: "Check in",
  out: "Check out",
};

export type Cart = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  timezone: string;
};

/** The person punching, as the punch screen needs them. */
export type Worker = {
  id: string;
  fullName: string;
  role: Role;
  /** Wall-clock times in the cart's timezone. Null means no fixed shift. */
  shiftStart: string | null;
  shiftEnd: string | null;
  /** Minutes past `shiftStart` that still count as on time. */
  graceMinutes: number;
  cart: Cart;
};

/** Where a punch's uniform verdict got to. Check-outs never have one. */
export type UniformVerdict = {
  status: "queued" | "running" | "done" | "failed" | "skipped";
  verdict: "pass" | "fail" | "unclear" | null;
  /** Per-item grades, e.g. {"cap": "g", "apron": "p"}. */
  items: Record<string, string> | null;
  reason: string | null;
  /** Out of 100, from the cart's uniform weights. Null until judged. */
  score: number | null;
};

/**
 * Whether a person still has to look at this punch.
 *
 * "pending" is set when the punch was recorded without a settled verdict, which
 * is the deliberate trade in this system: attendance is never blocked by an
 * unavailable model, so the uncertainty is handed to a manager instead.
 */
export type ReviewStatus = "none" | "pending" | "cleared" | "flagged";

export type AttendanceEvent = {
  id: string;
  kind: PunchKind;
  happenedAt: string;
  businessDate: string;
  distanceM: number | null;
  geofenceOk: boolean;
  /** Raw minutes past the shift start, whether or not that counts as late. */
  lateByMinutes: number | null;
  earlyByMinutes: number | null;
  /** True once `lateByMinutes` exceeds the grace allowance. */
  isLate: boolean;
  graceMinutes: number | null;
  reviewStatus: ReviewStatus;
  dressCheck: UniformVerdict | null;
};

/** What the punch screen needs to decide which button to offer. */
export type AttendanceStatus = {
  worker: Worker;
  /** Today's punches in the cart's timezone, oldest first. */
  events: AttendanceEvent[];
  /** True between an 'in' with no matching 'out'. */
  onShift: boolean;
  /** The punch the worker can make right now. */
  nextKind: PunchKind;
};

export function parsePunchKind(value: unknown): PunchKind | null {
  return value === "in" || value === "out" ? value : null;
}
