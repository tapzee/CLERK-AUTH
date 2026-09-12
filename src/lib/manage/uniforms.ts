import "server-only";

import { MAX_UPLOAD_BYTES, sniffImageType } from "@/lib/photos";
import { activeProvider, ALLOWED_TYPES, providerFor, StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_PASS_SCORE,
  normaliseWeights,
  type ItemKey,
} from "@/lib/uniform/items";

/**
 * What "in uniform" means, and what the real garments look like.
 *
 * Owner-only: a uniform is attached to carts, so changing a pass mark here
 * changes the bar at every cart using it. That is why `uniform:write` is not in
 * a manager's permission set.
 */

export type UniformReference = {
  kind: ItemKey;
  /** A short-lived signed URL, or null if the object has gone missing. */
  url: string | null;
  byteSize: number;
};

export type UniformRecord = {
  id: string;
  name: string;
  promptNotes: string | null;
  weights: Record<ItemKey, number>;
  passScore: number;
  references: UniformReference[];
  /** How many carts are held to this uniform. */
  cartCount: number;
};

type ProfileRow = {
  id: string;
  name: string;
  prompt_notes: string | null;
  score_weights: unknown;
  pass_score: number | null;
};

type ReferenceRow = {
  uniform_profile_id: string;
  kind: ItemKey;
  provider: string;
  storage_path: string;
  byte_size: number;
};

export async function listUniforms(): Promise<UniformRecord[]> {
  const supabase = supabaseAdmin();

  const [profiles, carts, references] = await Promise.all([
    supabase
      .from("uniform_profiles")
      .select("id, name, prompt_notes, score_weights, pass_score")
      .order("name"),
    supabase.from("carts").select("uniform_profile_id"),
    supabase
      .from("uniform_reference_images")
      .select("uniform_profile_id, kind, provider, storage_path, byte_size"),
  ]);

  if (profiles.error) {
    throw new StorageError(`Could not load uniforms: ${profiles.error.message}`, 502);
  }

  const counts = new Map<string, number>();
  for (const row of (carts.data ?? []) as { uniform_profile_id: string | null }[]) {
    if (row.uniform_profile_id) {
      counts.set(row.uniform_profile_id, (counts.get(row.uniform_profile_id) ?? 0) + 1);
    }
  }

  const referenceRows = (references.data ?? []) as ReferenceRow[];
  const urls = await signReferences(referenceRows);

  return ((profiles.data ?? []) as ProfileRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    promptNotes: row.prompt_notes,
    weights: normaliseWeights(row.score_weights),
    passScore: row.pass_score ?? DEFAULT_PASS_SCORE,
    cartCount: counts.get(row.id) ?? 0,
    references: referenceRows
      .filter((reference) => reference.uniform_profile_id === row.id)
      .map((reference) => ({
        kind: reference.kind,
        url: urls.get(`${reference.provider}:${reference.storage_path}`) ?? null,
        byteSize: reference.byte_size,
      })),
  }));
}

/** Thumbnails are signed one batch per provider rather than one call per image. */
async function signReferences(rows: ReferenceRow[]): Promise<Map<string, string | null>> {
  const byProvider = new Map<string, string[]>();
  for (const row of rows) {
    byProvider.set(row.provider, [...(byProvider.get(row.provider) ?? []), row.storage_path]);
  }

  const urls = new Map<string, string | null>();
  await Promise.all(
    [...byProvider].map(async ([provider, paths]) => {
      const resolved = await providerFor(provider).signedUrls(paths);
      for (const [path, url] of resolved) urls.set(`${provider}:${path}`, url);
    }),
  );
  return urls;
}

export type UniformInput = {
  id?: string;
  name: string;
  promptNotes: string | null;
  weights: Record<ItemKey, number>;
  passScore: number;
};

export async function saveUniform(input: UniformInput): Promise<void> {
  const row = {
    name: input.name,
    prompt_notes: input.promptNotes,
    score_weights: input.weights,
    pass_score: input.passScore,
  };

  const { error } = input.id
    ? await supabaseAdmin().from("uniform_profiles").update(row).eq("id", input.id)
    : await supabaseAdmin().from("uniform_profiles").insert(row);

  if (error) throw new StorageError(`Could not save the uniform: ${error.message}`, 502);
}

/**
 * Stores one reference photo for a uniform item, replacing any previous one.
 *
 * These are company assets rather than one person's photos, so they live under
 * a `uniforms/<profile>` prefix instead of an uploader's folder.
 */
export async function saveReferenceImage(input: {
  uniformProfileId: string;
  kind: ItemKey;
  file: File;
}): Promise<void> {
  const supabase = supabaseAdmin();

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) {
    throw new StorageError("Only JPEG, PNG, and WebP images are accepted.", 415);
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new StorageError("That image is too large.", 413);
  }

  const provider = activeProvider();
  const { path } = await provider.upload({
    userId: "uniforms",
    pathPrefix: `uniforms/${input.uniformProfileId}`,
    bytes,
    contentType,
    extension: ALLOWED_TYPES[contentType],
  });

  // Read the old row first so its object can be removed once the new one is
  // safely recorded -- losing the pointer would leak the file forever.
  const { data: previous } = await supabase
    .from("uniform_reference_images")
    .select("provider, storage_path")
    .eq("uniform_profile_id", input.uniformProfileId)
    .eq("kind", input.kind)
    .maybeSingle<{ provider: string; storage_path: string }>();

  const { error } = await supabase.from("uniform_reference_images").upsert(
    {
      uniform_profile_id: input.uniformProfileId,
      kind: input.kind,
      provider: provider.name,
      storage_path: path,
      content_type: contentType,
      byte_size: bytes.byteLength,
    },
    { onConflict: "uniform_profile_id,kind" },
  );

  if (error) {
    await provider.remove([path]);
    throw new StorageError(`Could not save the reference image: ${error.message}`, 502);
  }

  if (previous) {
    await providerFor(previous.provider).remove([previous.storage_path]).catch(() => {});
  }
}

export async function deleteReferenceImage(
  uniformProfileId: string,
  kind: ItemKey,
): Promise<void> {
  const supabase = supabaseAdmin();

  const { data } = await supabase
    .from("uniform_reference_images")
    .select("provider, storage_path")
    .eq("uniform_profile_id", uniformProfileId)
    .eq("kind", kind)
    .maybeSingle<{ provider: string; storage_path: string }>();

  if (!data) return;

  await supabase
    .from("uniform_reference_images")
    .delete()
    .eq("uniform_profile_id", uniformProfileId)
    .eq("kind", kind);

  await providerFor(data.provider).remove([data.storage_path]).catch(() => {});
}
