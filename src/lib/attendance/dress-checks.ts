import "server-only";

import {
  checkUniforms,
  ITEM_KEYS,
  scoreObservation,
  type CheckSubject,
  type ItemKey,
  type ReferenceImage,
  type UniformSpec,
} from "@/lib/gemini/dresscode";
import { after } from "next/server";

import { serverEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { providerFor, StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** How many photos ride in one model call. */
const BATCH_SIZE = 8;

const DEFAULT_WEIGHTS: Record<ItemKey, number> = {
  cap: 20,
  apron: 20,
  shirt: 25,
  logo: 15,
  neat: 20,
};

const DEFAULT_UNIFORM: UniformSpec = {
  promptNotes: null,
  weights: DEFAULT_WEIGHTS,
  passScore: 70,
  references: [],
};

export type DressCheckSummary = {
  status: "queued" | "running" | "done" | "failed" | "skipped";
  verdict: "pass" | "fail" | "unclear" | null;
  items: Record<string, string> | null;
  reason: string | null;
  score: number | null;
};

/**
 * Queues a verdict for a check-in.
 *
 * Check-outs are never queued: re-verifying a uniform at the end of a shift
 * costs a model call and tells the business nothing it did not already learn
 * at check-in.
 */
export async function enqueueDressCheck(input: {
  attendanceEventId: string;
  photoId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("dress_checks").insert({
    attendance_event_id: input.attendanceEventId,
    photo_id: input.photoId,
    // One photo serves both roles. Gemini 3.x prices an image by media
    // resolution rather than by its pixel size, so a second, smaller copy would
    // save upload bandwidth and not one token.
    model_photo_id: input.photoId,
    status: "queued",
  });

  if (error) {
    // A punch must not fail because its verdict could not be queued.
    console.error("[dress-checks] enqueue failed", error.message);
  }
}

/** The verdict attached to one punch, for the staff-facing screen. */
export async function getDressCheck(
  attendanceEventId: string,
): Promise<DressCheckSummary | null> {
  const { data, error } = await supabaseAdmin()
    .from("dress_checks")
    .select("status, verdict, items, reason, score")
    .eq("attendance_event_id", attendanceEventId)
    .maybeSingle<DressCheckSummary>();

  if (error) {
    throw new StorageError(`Could not read the dress check: ${error.message}`, 502);
  }
  return data;
}

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
  id: string;
  uniformKey: string;
  uniform: UniformSpec;
  bytes: Uint8Array;
  mimeType: string;
};

/**
 * Pulls photo bytes through a signed URL rather than a provider-specific
 * download call, so this works the same whether the bytes live in Supabase
 * Storage or Cloudinary.
 */
async function loadBytes(provider: string, path: string): Promise<Uint8Array | null> {
  const urls = await providerFor(provider).signedUrls([path]);
  const url = urls.get(path);
  if (!url) return null;

  const response = await fetch(url);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

function normaliseWeights(raw: unknown): Record<ItemKey, number> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const weights = {} as Record<ItemKey, number>;

  for (const key of ITEM_KEYS) {
    const value = Number(source[key]);
    weights[key] = Number.isFinite(value) && value > 0 ? value : 0;
  }

  // An all-zero set would make every check trivially pass, which is never what
  // an admin meant — fall back rather than silently rubber-stamp everyone.
  return ITEM_KEYS.some((key) => weights[key] > 0) ? weights : DEFAULT_WEIGHTS;
}

/** Loads each uniform once, with its reference photos, for the whole batch. */
async function loadUniforms(profileIds: string[]): Promise<Map<string, UniformSpec>> {
  const byId = new Map<string, UniformSpec>();
  if (profileIds.length === 0) return byId;

  const supabase = supabaseAdmin();
  const [profiles, references] = await Promise.all([
    supabase
      .from("uniform_profiles")
      .select("id, prompt_notes, score_weights, pass_score")
      .in("id", profileIds),
    supabase
      .from("uniform_reference_images")
      .select("uniform_profile_id, kind, provider, storage_path, content_type")
      .in("uniform_profile_id", profileIds),
  ]);

  type ProfileRow = {
    id: string;
    prompt_notes: string | null;
    score_weights: unknown;
    pass_score: number | null;
  };
  type ReferenceRow = {
    uniform_profile_id: string;
    kind: ItemKey;
    provider: string;
    storage_path: string;
    content_type: string;
  };

  for (const row of ((profiles.data ?? []) as ProfileRow[])) {
    byId.set(row.id, {
      promptNotes: row.prompt_notes,
      weights: normaliseWeights(row.score_weights),
      passScore: row.pass_score ?? 70,
      references: [],
    });
  }

  // Fetched in parallel; a uniform has at most four of these and they are
  // shared by every staff member in the batch.
  await Promise.all(
    ((references.data ?? []) as ReferenceRow[]).map(async (row) => {
      const spec = byId.get(row.uniform_profile_id);
      if (!spec) return;

      const bytes = await loadBytes(row.provider, row.storage_path);
      if (!bytes) return;

      const reference: ReferenceImage = {
        kind: row.kind,
        bytes,
        mimeType: row.content_type,
      };
      spec.references.push(reference);
    }),
  );

  return byId;
}

/** Gathers everything a claimed row needs before it can be judged. */
async function hydrate(rows: ClaimedRow[]): Promise<Job[]> {
  const supabase = supabaseAdmin();

  const photoIds = rows
    .map((row) => row.model_photo_id ?? row.photo_id)
    .filter((id): id is string => !!id);
  const eventIds = rows.map((row) => row.attendance_event_id);

  const [photos, events] = await Promise.all([
    supabase
      .from("photos")
      .select("id, provider, storage_path, content_type")
      .in("id", photoIds),
    supabase
      .from("attendance_events")
      .select("id, carts!inner ( uniform_profile_id )")
      .in("id", eventIds),
  ]);

  type PhotoRow = { id: string; provider: string; storage_path: string; content_type: string };
  type CartEmbed = { uniform_profile_id: string | null };
  // PostgREST returns a many-to-one embed as an object, but the generated types
  // cannot prove the cardinality and widen it to an array. Accept either rather
  // than asserting one shape and breaking on the other.
  type EventRow = { id: string; carts: CartEmbed | CartEmbed[] | null };

  const photoById = new Map(
    ((photos.data ?? []) as PhotoRow[]).map((row) => [row.id, row]),
  );
  const profileByEvent = new Map(
    ((events.data ?? []) as unknown as EventRow[]).map((row) => {
      const cart = Array.isArray(row.carts) ? row.carts[0] : row.carts;
      return [row.id, cart?.uniform_profile_id ?? null];
    }),
  );

  const uniformById = await loadUniforms([
    ...new Set([...profileByEvent.values()].filter((id): id is string => !!id)),
  ]);

  const jobs: Job[] = [];
  for (const row of rows) {
    const photoId = row.model_photo_id ?? row.photo_id;
    const photo = photoId ? photoById.get(photoId) : undefined;
    if (!photo) continue;

    const bytes = await loadBytes(photo.provider, photo.storage_path);
    if (!bytes) continue;

    const profileId = profileByEvent.get(row.attendance_event_id) ?? null;
    jobs.push({
      id: row.id,
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

export type WorkerReport = {
  claimed: number;
  judged: number;
  failed: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  note?: string;
};

/**
 * Processes one batch of pending checks.
 *
 * Called both by the cron schedule and, for latency, by `after()` on the punch
 * that created the row. Claiming is atomic, so the two racing is harmless.
 */
export async function runDressCheckBatch(batchSize = BATCH_SIZE): Promise<WorkerReport> {
  const empty: WorkerReport = {
    claimed: 0, judged: 0, failed: 0, calls: 0, inputTokens: 0, outputTokens: 0,
  };

  const used = await callsToday();
  if (used >= serverEnv.dressCheckDailyCap) {
    // Left queued rather than skipped: tomorrow's run picks them up, and the
    // cap stops a runaway loop instead of losing the work.
    return { ...empty, note: `daily cap of ${serverEnv.dressCheckDailyCap} reached` };
  }

  const { data, error } = await supabaseAdmin().rpc("claim_dress_checks", {
    batch_size: batchSize,
  });

  if (error) {
    throw new StorageError(`Could not claim dress checks: ${error.message}`, 502);
  }

  const rows = (data ?? []) as ClaimedRow[];
  if (rows.length === 0) return empty;

  const jobs = await hydrate(rows);

  // Anything that could not be hydrated has no image to judge.
  const unusable = rows.filter((row) => !jobs.some((job) => job.id === row.id));
  await markFailed(unusable.map((row) => row.id), "Could not load the photo to judge.");

  const report: WorkerReport = { ...empty, claimed: rows.length, failed: unusable.length };

  // A batch can span carts with different uniforms; each group is its own call
  // so every photo is judged against the right description and references.
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    groups.set(job.uniformKey, [...(groups.get(job.uniformKey) ?? []), job]);
  }

  for (const group of groups.values()) {
    const subjects: CheckSubject[] = group.map((job, index) => ({
      index: index + 1,
      bytes: job.bytes,
      mimeType: job.mimeType,
    }));

    try {
      const result = await checkUniforms(subjects, group[0].uniform);
      report.calls += 1;
      report.inputTokens += result.inputTokens;
      report.outputTokens += result.outputTokens;

      const byIndex = new Map(result.observations.map((o) => [o.index, o]));

      for (const [position, job] of group.entries()) {
        const observation = byIndex.get(position + 1);
        if (!observation) {
          await markFailed([job.id], "The model returned no result for this photo.");
          report.failed += 1;
          continue;
        }

        const scored = scoreObservation(observation, job.uniform);
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
            // Attributed evenly: the call is shared, and a per-photo split is
            // close enough for spend tracking.
            input_tokens: Math.round(result.inputTokens / group.length),
            output_tokens: Math.round(result.outputTokens / group.length),
            error: null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        if (writeError) {
          report.failed += 1;
          continue;
        }
        report.judged += 1;
      }
    } catch (modelError) {
      const message = modelError instanceof Error ? modelError.message : "Model call failed.";
      await markFailed(group.map((job) => job.id), message);
      report.failed += group.length;
    }
  }

  return report;
}

/**
 * Nudges the worker when the caller is waiting on a verdict.
 *
 * Vercel's Hobby plan caps cron at once a day, so the nightly sweep is a
 * long-stop rather than a retry loop. The punch screen already re-renders every
 * couple of seconds while a verdict is outstanding; hanging the retry off that
 * is what keeps a failed first attempt from sitting until morning. Runs after
 * the response, so nothing waits on it, and claiming is atomic so racing the
 * cron is harmless.
 */
export function kickWorkerIfPending(
  rateLimitKey: string,
  events: Array<{ dressCheck: { status: string } | null }>,
): void {
  // "failed" belongs here as much as "queued": the worker still reclaims those
  // rows until they run out of attempts, so leaving them out meant a check that
  // failed once sat untouched until the nightly sweep even though the staff
  // member was looking straight at it.
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
