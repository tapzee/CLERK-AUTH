import "server-only";

import { serverEnv } from "@/lib/env";
import { checkUniforms, type UniformSpec } from "@/lib/gemini/dresscode";
import {
  describeFaults,
  scoreGrades,
  type Grades,
  type ItemGrade,
  type Scored,
} from "@/lib/uniform/items";

/**
 * Judging one selfie while the worker waits.
 *
 * This is the blocking half of the uniform check: a failed check-in never
 * becomes an attendance record, so the worker is told what is wrong and takes
 * the photo again. `dress-checks.ts` is the other half -- the batch worker that
 * catches up on anything this could not settle in time.
 */

export type UniformOutcome =
  /** Good enough to punch. */
  | "pass"
  /** Definitely not in uniform. The punch is refused. */
  | "fail"
  /** The photo could not settle it. The punch stands, a manager reviews it. */
  | "unclear"
  /** The model never answered. The punch stands, the queue retries it. */
  | "unavailable";

export type UniformResult = {
  outcome: UniformOutcome;
  /** Per-item grades, or null when the model never answered. */
  grades: Grades | null;
  /** Whether the surroundings looked like a cart -- a free second signal. */
  atCart: ItemGrade | null;
  scored: Scored | null;
  /** The model's own few words on what was wrong. */
  why: string | null;

  model: string | null;
  inputTokens: number;
  outputTokens: number;
  /** Why there is no verdict, when the outcome is "unavailable". */
  error: string | null;
};

const UNAVAILABLE = (error: string): UniformResult => ({
  outcome: "unavailable",
  grades: null,
  atCart: null,
  scored: null,
  why: null,
  model: null,
  inputTokens: 0,
  outputTokens: 0,
  error,
});

/**
 * Asks the model about one photo, with a deadline.
 *
 * Never throws. Every failure path -- a timeout, a quota rejection, a malformed
 * response -- comes back as "unavailable", because the alternative is a worker
 * who cannot clock in for reasons that have nothing to do with their cap.
 */
export async function judgeSelfie(
  image: { bytes: Uint8Array; contentType: string },
  uniform: UniformSpec,
): Promise<UniformResult> {
  try {
    const result = await checkUniforms(
      [{ index: 1, bytes: image.bytes, mimeType: image.contentType }],
      uniform,
      AbortSignal.timeout(serverEnv.uniformCheckTimeoutMs),
    );

    const observation = result.observations[0];
    if (!observation) {
      return UNAVAILABLE("The model returned no verdict for this photo.");
    }

    const scored = scoreGrades(observation.items, uniform.weights, uniform.passScore);

    return {
      outcome: scored.verdict,
      grades: observation.items,
      atCart: observation.atCart,
      scored,
      why: observation.why,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The uniform check failed.";
    console.error("[uniform-check]", message);
    return UNAVAILABLE(message);
  }
}

/**
 * What a rejected worker is told.
 *
 * Specific enough to act on -- "no cap, apron worn badly" beats "not in
 * uniform" -- and always ends with the instruction, because the whole point of
 * blocking the punch is that they go and fix it.
 */
export function rejectionMessage(result: UniformResult): string {
  const faults = describeFaults(result.grades);

  const opening = faults
    ? `Uniform check failed: ${faults}.`
    : "Uniform check failed — you are not in full uniform.";

  const detail = result.why ? ` The check noted: ${result.why}.` : "";

  return `${opening}${detail} Put your uniform right and take the photo again.`;
}
