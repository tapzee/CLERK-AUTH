import "server-only";

import { readObjectBytes } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ReferenceImage, UniformSpec } from "@/lib/gemini/dresscode";
import {
  DEFAULT_PASS_SCORE,
  DEFAULT_WEIGHTS,
  normaliseWeights,
  type ItemKey,
} from "./items";

/**
 * Loading the uniform a photo will be judged against.
 *
 * Both callers need exactly this: the punch route, which checks one worker
 * while they wait, and the queue worker, which catches up on a batch. Keeping
 * it in one place is what stops the two from judging the same cart against
 * different rules.
 */

/** Used when a cart has no uniform attached, so a check still means something. */
export const DEFAULT_UNIFORM: UniformSpec = {
  promptNotes: null,
  weights: DEFAULT_WEIGHTS,
  passScore: DEFAULT_PASS_SCORE,
  references: [],
};

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

/**
 * Loads several uniforms at once, each with its reference photos.
 *
 * Two queries and one parallel fetch regardless of how many profiles are asked
 * for, because a batch can span carts that use different uniforms and doing
 * this per row would turn one model call into a dozen round trips first.
 */
export async function loadUniforms(
  profileIds: string[],
): Promise<Map<string, UniformSpec>> {
  const byId = new Map<string, UniformSpec>();

  const ids = [...new Set(profileIds)];
  if (ids.length === 0) return byId;

  const supabase = supabaseAdmin();
  const [profiles, references] = await Promise.all([
    supabase
      .from("uniform_profiles")
      .select("id, prompt_notes, score_weights, pass_score")
      .in("id", ids),
    supabase
      .from("uniform_reference_images")
      .select("uniform_profile_id, kind, provider, storage_path, content_type")
      .in("uniform_profile_id", ids),
  ]);

  for (const row of (profiles.data ?? []) as ProfileRow[]) {
    byId.set(row.id, {
      promptNotes: row.prompt_notes,
      weights: normaliseWeights(row.score_weights),
      passScore: row.pass_score ?? DEFAULT_PASS_SCORE,
      references: [],
    });
  }

  // A uniform has at most four of these and they are shared by every worker in
  // the batch, so fetching them in parallel costs one round trip in wall time.
  await Promise.all(
    ((references.data ?? []) as ReferenceRow[]).map(async (row) => {
      const spec = byId.get(row.uniform_profile_id);
      if (!spec) return;

      const bytes = await readObjectBytes(row.provider, row.storage_path);
      if (!bytes) return;

      const reference: ReferenceImage = { kind: row.kind, bytes, mimeType: row.content_type };
      spec.references.push(reference);
    }),
  );

  return byId;
}

/** The uniform in force at one cart, falling back to the default. */
export async function loadUniformForCart(cartId: string): Promise<UniformSpec> {
  const { data } = await supabaseAdmin()
    .from("carts")
    .select("uniform_profile_id")
    .eq("id", cartId)
    .maybeSingle<{ uniform_profile_id: string | null }>();

  const profileId = data?.uniform_profile_id;
  if (!profileId) return DEFAULT_UNIFORM;

  const loaded = await loadUniforms([profileId]);
  return loaded.get(profileId) ?? DEFAULT_UNIFORM;
}
