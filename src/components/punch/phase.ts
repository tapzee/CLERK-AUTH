import type { PunchKind } from "@/lib/attendance/types";
import type { CaptureStatus } from "@/lib/hooks/useSelfieCapture";

/**
 * The punch screen's state machine, shared with the parts that render it.
 *
 * It extends the capture hook's own status rather than restating it, so a photo
 * that is being taken and a punch that is being submitted are states of one
 * machine — there is no way to be mid-upload and mid-capture at once.
 */
export type Phase =
  | CaptureStatus
  | { kind: "submitting" }
  /** The uniform check refused the photo; nothing was recorded. */
  | { kind: "rejected"; message: string; grades: Record<string, string> | null }
  | { kind: "done"; message: string; tone: "success" | "warning" };

/**
 * What to tell somebody whose punch went through.
 *
 * A late check-in is a warning rather than an error: the punch was accepted and
 * the minutes are already on the row. Saying so here, at the moment it happens,
 * is fairer than letting them find it on a payslip.
 */
export function confirmation(
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
