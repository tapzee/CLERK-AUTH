import "server-only";

import { readObjectBytes } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ReferenceDescription, ReferenceImage, UniformSpec } from "@/lib/gemini/dresscode";
import { DEFAULT_PASS_SCORE, weightsFromReferences, type ItemKey } from "./items";

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
  weights: weightsFromReferences([]),
  passScore: DEFAULT_PASS_SCORE,
  referenceImages: [],
  referenceDescriptions: [],
};

type ProfileRow = {
  id: string;
  prompt_notes: string | null;
  pass_score: number | null;
};

type ReferenceRow = {
  uniform_profile_id: string;
  kind: ItemKey;
  provider: string;
  storage_path: string;
  content_type: string;
  description: string | null;
};

/**
 * Loads several uniforms at once, each with its reference photos or descriptions.
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
    supabase.from("uniform_profiles").select("id, prompt_notes, pass_score").in("id", ids),
    supabase
      .from("uniform_reference_images")
      .select("uniform_profile_id, kind, provider, storage_path, content_type, description")
      .in("uniform_profile_id", ids),
  ]);

  const referenceRows = (references.data ?? []) as ReferenceRow[];

  // Which items an owner has actually given a photo for -- this is the whole
  // configuration a score needs, so it decides the weights directly rather
  // than through a number the owner would otherwise have to set by hand.
  const presentKindsByProfile = new Map<string, ItemKey[]>();
  for (const row of referenceRows) {
    presentKindsByProfile.set(row.uniform_profile_id, [
      ...(presentKindsByProfile.get(row.uniform_profile_id) ?? []),
      row.kind,
    ]);
  }

  for (const row of (profiles.data ?? []) as ProfileRow[]) {
    byId.set(row.id, {
      promptNotes: row.prompt_notes,
      weights: weightsFromReferences(presentKindsByProfile.get(row.id) ?? []),
      passScore: row.pass_score ?? DEFAULT_PASS_SCORE,
      referenceImages: [],
      referenceDescriptions: [],
    });
  }

  // The logo is fetched as bytes; other garments use their written description
  // when present to save input tokens, falling back to bytes when not yet described.
  await Promise.all(
    referenceRows.map(async (row) => {
      const spec = byId.get(row.uniform_profile_id);
      if (!spec) return;

      if (row.kind !== "logo" && row.description) {
        const desc: ReferenceDescription = { kind: row.kind, text: row.description };
        spec.referenceDescriptions.push(desc);
        return;
      }

      const bytes = await readObjectBytes(row.provider, row.storage_path);
      if (!bytes) return;

      const reference: ReferenceImage = { kind: row.kind, bytes, mimeType: row.content_type };
      spec.referenceImages.push(reference);
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
