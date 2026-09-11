/**
 * Shared between client and server, so this module must stay free of any
 * `server-only` import.
 */

/** A punch is either the start or the end of a shift. */
export type PunchKind = "in" | "out";

export type StaffRole = "staff" | "manager" | "admin";

export type Cart = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  timezone: string;
};

export type Staff = {
  id: string;
  fullName: string;
  role: StaffRole;
  shiftStart: string | null;
  shiftEnd: string | null;
  cart: Cart;
};

/** Where a punch's uniform verdict has got to. Check-outs never have one. */
export type DressCheck = {
  status: "queued" | "running" | "done" | "failed" | "skipped";
  verdict: "pass" | "fail" | "unclear" | null;
  /** Per-item outcome, e.g. {"cap": "y", "apron": "n"}. */
  items: Record<string, string> | null;
  reason: string | null;
};

export type AttendanceEvent = {
  id: string;
  kind: PunchKind;
  happenedAt: string;
  businessDate: string;
  distanceM: number | null;
  geofenceOk: boolean;
  lateByMinutes: number | null;
  earlyByMinutes: number | null;
  dressCheck: DressCheck | null;
};

/** What the punch screen needs to decide which button to offer. */
export type AttendanceStatus = {
  staff: Staff;
  /** Today's punches in the cart's timezone, oldest first. */
  events: AttendanceEvent[];
  /** True between an 'in' with no matching 'out'. */
  onShift: boolean;
  /** The punch the staff member can make right now. */
  nextKind: PunchKind;
};

export function parsePunchKind(value: unknown): PunchKind | null {
  return value === "in" || value === "out" ? value : null;
}
