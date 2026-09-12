import "server-only";

import { after } from "next/server";

import { serverEnv } from "@/lib/env";
import { checkUniforms, type CheckSubject, type UniformSpec } from "@/lib/gemini/dresscode";
import { checkRateLimit } from "@/lib/rate-limit";
import { readObjectBytes, StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scoreGrades } from "@/lib/uniform/items";
import { DEFAULT_UNIFORM, loadUniforms } from "@/lib/uniform/profile";

/**
 * The catch-up worker for uniform verdicts.
 *
 * Most checks are settled inline by the punch route while the worker waits --
 * see `uniform-check.ts`. This exists for the ones that were not: a model
 * timeout, a quota rejection, or a burst that outran the request. Those punches
 * are already recorded and flagged for a manager; when this worker reaches a
 * verdict on its own, a clean pass un-flags them, so a person only ever looks
 * at what the model genuinely could not settle.
 */

/** How many photos ride in one model call. */
const BATCH_SIZE = 8;

/**
 * Model calls made today, against the daily cap.
 *
 * Counting completed rows rather than keeping a separate counter means the
 * number cannot drift away from what actually happened.
 */
async function callsToday(): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin()
    .from("dress_checks")
    .select("id", { count: "exact", head: true })
    .not("completed_at", "is", null)
    .gte("completed_at", since.toISOString());

  if (error) {
    throw new StorageError(`Could not read today's usage: ${error.message}`, 502);
  }
  return count ?? 0;
}

type ClaimedRow = {
  id: string;
  attendance_event_id: string;
  photo_id: string | null;
  model_photo_id: string | null;
};

type Job = {
  checkId: string;
  eventId: string;
  /** Groups jobs so each model call judges one uniform's worth of photos. */
  uniformKey: string;
  uniform: UniformSpec;
  bytes: Uint8Array;
  mimeType: string;
};

/** Gathers everything a claimed row needs before it can be judged. */
async function hydrate(rows: ClaimedRow[]): Promise<Job[]> {
  const supabase = supabaseAdmin();

  const photoIds = rows
    .map((row) => row.model_photo_id ?? row.photo_id)
    .filter((id): id is string => !!id);

  const [photos, events] = await Promise.all([
    supabase
      .from("photos")
      .select("id, provider, storage_path, content_type")
      .in("id", photoIds),
    supabase
      .from("attendance_events")
      .select("id, carts!inner ( uniform_profile_id )")
      .in("id", rows.map((row) => row.attendance_event_id)),
  ]);

  type PhotoRow = { id: string; provider: string; storage_path: string; content_type: string };
  type CartEmbed = { uniform_profile_id: string | null };
  // PostgREST returns a many-to-one embed as an object, but the generated types
  // cannot prove the cardinality and widen it to an array. Accept either rather
  // than asserting one shape and breaking on the other.
  type EventRow = { id: string; carts: CartEmbed | CartEmbed[] | null };

  const photoById = new Map(((photos.data ?? []) as PhotoRow[]).map((row) => [row.id, row]));
  const profileByEvent = new Map(
    ((events.data ?? []) as unknown as EventRow[]).map((row) => {
      const cart = Array.isArray(row.carts) ? row.carts[0] : row.carts;
      return [row.id, cart?.uniform_profile_id ?? null];
    }),
  );

  const uniformById = await loadUniforms(
    [...profileByEvent.values()].filter((id): id is string => !!id),
  );

  const jobs: Job[] = [];
  for (const row of rows) {
    const photoId = row.model_photo_id ?? row.photo_id;
    const photo = photoId ? photoById.get(photoId) : undefined;
    if (!photo) continue;

    const bytes = await readObjectBytes(photo.provider, photo.storage_path);
    if (!bytes) continue;

    const profileId = profileByEvent.get(row.attendance_event_id) ?? null;
    jobs.push({
      checkId: row.id,
      eventId: row.attendance_event_id,
      uniformKey: profileId ?? "default",
      uniform: (profileId && uniformById.get(profileId)) || DEFAULT_UNIFORM,
      bytes,
      mimeType: photo.content_type,
    });
  }
  return jobs;
}

async function markFailed(ids: string[], message: string): Promise<void> {
  if (ids.length === 0) return;
  await supabaseAdmin()
    .from("dress_checks")
    .update({ status: "failed", error: message.slice(0, 500), claimed_at: null })
    .in("id", ids);
}

/**
 * Takes a punch off the manager's review queue.
 *
 * Only ever on a clean pass, and only from 'pending': a manager who has already
 * looked at something and made a call must not have that call undone by a late
 * verdict arriving behind them.
 */
async function clearReviewFlag(eventId: string): Promise<void> {
  await supabaseAdmin()
    .from("attendance_events")
    .update({ review_status: "none" })
    .eq("id", eventId)
    .eq("review_status", "pending");
}

export type WorkerReport = {
  claimed: number;
  judged: number;
  failed: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  note?: string;
};

const EMPTY_REPORT: WorkerReport = {
  claimed: 0,
  judged: 0,
  failed: 0,
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
};

/**
 * Processes one batch of pending checks.
 *
 * Called both by the cron schedule and, for latency, by `after()` on the punch
 * screen's poll. Claiming is atomic, so the two racing is harmless.
 */
export async function runDressCheckBatch(batchSize = BATCH_SIZE): Promise<WorkerReport> {
  const used = await callsToday();
  if (used >= serverEnv.dressCheckDailyCap) {
    // Left queued rather than skipped: tomorrow's run picks them up, and the
    // cap stops a runaway loop instead of losing the work.
    return { ...EMPTY_REPORT, note: `daily cap of ${serverEnv.dressCheckDailyCap} reached` };
  }

  const { data, error } = await supabaseAdmin().rpc("claim_dress_checks", {
    batch_size: batchSize,
  });

  if (error) {
    throw new StorageError(`Could not claim dress checks: ${error.message}`, 502);
  }

  const rows = (data ?? []) as ClaimedRow[];
  if (rows.length === 0) return { ...EMPTY_REPORT };

  const jobs = await hydrate(rows);

  // Anything that could not be hydrated has no image to judge.
  const unusable = rows.filter((row) => !jobs.some((job) => job.checkId === row.id));
  await markFailed(unusable.map((row) => row.id), "Could not load the photo to judge.");

  const report: WorkerReport = {
    ...EMPTY_REPORT,
    claimed: rows.length,
    failed: unusable.length,
  };

  // A batch can span carts with different uniforms; each group is its own call
  // so every photo is judged against the right description and references.
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    groups.set(job.uniformKey, [...(groups.get(job.uniformKey) ?? []), job]);
  }

  for (const group of groups.values()) {
    await judgeGroup(group, report);
  }

  return report;
}

/** One model call, and the writes that follow from it. */
async function judgeGroup(group: Job[], report: WorkerReport): Promise<void> {
  const subjects: CheckSubject[] = group.map((job, index) => ({
    index: index + 1,
    bytes: job.bytes,
    mimeType: job.mimeType,
  }));

  let result;
  try {
    result = await checkUniforms(subjects, group[0].uniform);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model call failed.";
    await markFailed(group.map((job) => job.checkId), message);
    report.failed += group.length;
    return;
  }

  report.calls += 1;
  report.inputTokens += result.inputTokens;
  report.outputTokens += result.outputTokens;

  const byIndex = new Map(result.observations.map((observation) => [observation.index, observation]));

  for (const [position, job] of group.entries()) {
    const observation = byIndex.get(position + 1);
    if (!observation) {
      await markFailed([job.checkId], "The model returned no result for this photo.");
      report.failed += 1;
      continue;
    }

    const scored = scoreGrades(observation.items, job.uniform.weights, job.uniform.passScore);

    const { error: writeError } = await supabaseAdmin()
      .from("dress_checks")
      .update({
        status: "done",
        verdict: scored.verdict,
        score: scored.score,
        score_best: scored.best,
        score_worst: scored.worst,
        items: { ...observation.items, at_cart: observation.atCart },
        reason: scored.verdict === "pass" ? null : observation.why,
        model: result.model,
        // Attributed evenly: the call is shared, and a per-photo split is close
        // enough for spend tracking.
        input_tokens: Math.round(result.inputTokens / group.length),
        output_tokens: Math.round(result.outputTokens / group.length),
        error: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.checkId);

    if (writeError) {
      report.failed += 1;
      continue;
    }

    if (scored.verdict === "pass") await clearReviewFlag(job.eventId);
    report.judged += 1;
  }
}

/**
 * Nudges the worker when somebody is waiting on a verdict.
 *
 * Vercel's Hobby plan caps cron at once a day, so the nightly sweep is a
 * long-stop rather than a retry loop. The punch screen re-renders every couple
 * of seconds while a verdict is outstanding; hanging the retry off that is what
 * keeps a timed-out check from sitting until morning. Runs after the response,
 * so nothing waits on it, and claiming is atomic so racing the cron is safe.
 */
export function kickWorkerIfPending(
  rateLimitKey: string,
  events: Array<{ dressCheck: { status: string } | null }>,
): void {
  // "failed" belongs here as much as "queued": the worker still reclaims those
  // rows until they run out of attempts.
  const pending = events.some((event) =>
    ["queued", "running", "failed"].includes(event.dressCheck?.status ?? ""),
  );
  if (!pending) return;

  // A tab left open on the punch screen polls indefinitely; this stops that
  // from becoming a hot loop against the queue.
  if (!checkRateLimit(`dress-kick:${rateLimitKey}`, 20, 60_000).ok) return;

  after(async () => {
    try {
      await runDressCheckBatch();
    } catch (error) {
      console.error("[dress-checks] kick failed", error);
    }
  });
}
