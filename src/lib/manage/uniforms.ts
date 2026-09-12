import "server-only";

import { describeReferenceImage } from "@/lib/gemini/dresscode";
import { MAX_UPLOAD_BYTES, sniffImageType } from "@/lib/photos";
import { activeProvider, ALLOWED_TYPES, providerFor, StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_PASS_SCORE, weightsFromReferences, type ItemKey } from "@/lib/uniform/items";

/**
 * What "in uniform" means, and what the real garments look like.
 *
 * Owner-only: a uniform is attached to carts, so changing a pass mark here
 * changes the bar at every cart using it. That is why `uniform:write` is not in
 * a manager's permission set.
 *
 * There is no weight for an owner to set. An item counts toward the score,
 * weighted equally with the rest, the moment its reference photo is uploaded --
 * see `weightsFromReferences`. Uploading the photo *is* the configuration.
 */

export type UniformReference = {
  kind: ItemKey;
  /** A short-lived signed URL, or null if the object has gone missing. */
  url: string | null;
  byteSize: number;
  /**
   * What the check reads instead of this photo, written up once by the model
   * (or corrected by an owner afterwards). Always null for the logo, which is
   * sent as the photo itself on every check rather than described in words --
   * see the module comment on `describeReferenceImage`.
   */
  description: string | null;
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
  pass_score: number | null;
};

type ReferenceRow = {
  uniform_profile_id: string;
  kind: ItemKey;
  provider: string;
  storage_path: string;
  byte_size: number;
  description: string | null;
};

export async function listUniforms(): Promise<UniformRecord[]> {
  const supabase = supabaseAdmin();

  const [profiles, carts, references] = await Promise.all([
    supabase.from("uniform_profiles").select("id, name, prompt_notes, pass_score").order("name"),
    supabase.from("carts").select("uniform_profile_id"),
    supabase
      .from("uniform_reference_images")
      .select("uniform_profile_id, kind, provider, storage_path, byte_size, description"),
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

  return ((profiles.data ?? []) as ProfileRow[]).map((row) => {
    const ownReferences = referenceRows.filter(
      (reference) => reference.uniform_profile_id === row.id,
    );

    return {
      id: row.id,
      name: row.name,
      promptNotes: row.prompt_notes,
      // Which items count, derived from which photos exist -- not a number
      // stored anywhere, so it can never drift out of sync with the uploads.
      weights: weightsFromReferences(ownReferences.map((reference) => reference.kind)),
      passScore: row.pass_score ?? DEFAULT_PASS_SCORE,
      cartCount: counts.get(row.id) ?? 0,
      references: ownReferences.map((reference) => ({
        kind: reference.kind,
        url: urls.get(`${reference.provider}:${reference.storage_path}`) ?? null,
        byteSize: reference.byte_size,
        description: reference.description,
      })),
    };
  });
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
  passScore: number;
};

export async function saveUniform(input: UniformInput): Promise<void> {
  const row = {
    name: input.name,
    prompt_notes: input.promptNotes,
    pass_score: input.passScore,
  };

  const { error } = input.id
    ? await supabaseAdmin().from("uniform_profiles").update(row).eq("id", input.id)
    : await supabaseAdmin().from("uniform_profiles").insert(row);

  if (error) throw new StorageError(`Could not save the uniform: ${error.message}`, 502);
}

/** Whether a kind is described in words rather than always sent as a photo. */
function isDescribable(kind: ItemKey): kind is Exclude<ItemKey, "logo"> {
  return kind !== "logo";
}

/**
 * Stores one reference photo for a uniform item, replacing any previous one.
 *
 * These are company assets rather than one person's photos, so they live under
 * a `uniforms/<profile>` prefix instead of an uploader's folder.
 *
 * For every kind except the logo, this also writes up the photo in words --
 * see `describeReferenceImage` -- because that description, not the photo, is
 * what a check reads from here on. A failed write-up does not fail the upload:
 * the photo is still saved, just without a description until the next upload
 * or a manual correction.
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

  const description = isDescribable(input.kind)
    ? await describeReferenceImage(bytes, contentType, input.kind)
    : null;

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
      description,
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

/**
 * Lets an owner correct the wording a description was auto-generated with.
 *
 * The logo never has a description to correct -- it is always sent as the
 * photo itself -- so this refuses that kind outright rather than silently
 * writing text nothing will ever read.
 */
export async function updateReferenceDescription(
  uniformProfileId: string,
  kind: ItemKey,
  description: string,
): Promise<void> {
  if (!isDescribable(kind)) {
    throw new StorageError("The logo is always matched from its photo, not a description.", 400);
  }

  const { error, count } = await supabaseAdmin()
    .from("uniform_reference_images")
    .update({ description }, { count: "exact" })
    .eq("uniform_profile_id", uniformProfileId)
    .eq("kind", kind);

  if (error) {
    throw new StorageError(`Could not save the description: ${error.message}`, 502);
  }
  if (!count) {
    throw new StorageError("Upload a reference photo for that item first.", 404);
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
