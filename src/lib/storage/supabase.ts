import "server-only";

import { serverEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { StorageError, type StorageProvider, type UploadInput } from "./types";

/** Signed URLs are short-lived; the gallery re-mints them on every render. */
const SIGNED_URL_TTL_SECONDS = 60 * 5;

export const supabaseStorage: StorageProvider = {
  name: "supabase",

  async upload({ userId, bytes, contentType, extension }: UploadInput) {
    // Built from the verified Clerk user id, so one user can never write into
    // another user's prefix.
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabaseAdmin()
      .storage.from(serverEnv.photosBucket)
      .upload(path, bytes, { contentType, cacheControl: "3600", upsert: false });

    if (error) {
      throw new StorageError(`Storage upload failed: ${error.message}`, 502);
    }
    return { path };
  },

  async signedUrls(paths) {
    if (paths.length === 0) return new Map();

    const { data } = await supabaseAdmin()
      .storage.from(serverEnv.photosBucket)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

    return new Map((data ?? []).map((entry) => [entry.path ?? "", entry.signedUrl ?? null]));
  },

  async remove(paths) {
    if (paths.length === 0) return;
    await supabaseAdmin().storage.from(serverEnv.photosBucket).remove(paths);
  },
};
