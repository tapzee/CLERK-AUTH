import "server-only";

import { cloudinaryStorage } from "./cloudinary";
import { supabaseStorage } from "./supabase";
import { StorageError, type ProviderName, type StorageProvider } from "./types";

const providers: Record<ProviderName, StorageProvider> = {
  supabase: supabaseStorage,
  cloudinary: cloudinaryStorage,
};

/** The backend new uploads go to, from STORAGE_PROVIDER (default: supabase). */
export function activeProvider(): StorageProvider {
  const name = (process.env.STORAGE_PROVIDER ?? "supabase") as ProviderName;
  const provider = providers[name];
  if (!provider) {
    throw new StorageError(
      `Unknown STORAGE_PROVIDER "${name}". Use "supabase" or "cloudinary".`,
      500,
    );
  }
  return provider;
}

/**
 * Rows record which backend holds them, so photos uploaded before a provider
 * switch keep resolving.
 */
export function providerFor(name: string): StorageProvider {
  return providers[name as ProviderName] ?? supabaseStorage;
}

/**
 * Reads a stored object back into memory.
 *
 * Pulls the bytes through a signed URL rather than a provider-specific download
 * call, so this works the same whether they live in Supabase Storage or
 * Cloudinary. Returns null instead of throwing: a missing object is a row to
 * skip, not a reason to fail the batch it was part of.
 */
export async function readObjectBytes(
  provider: string,
  path: string,
): Promise<Uint8Array | null> {
  const urls = await providerFor(provider).signedUrls([path]);
  const url = urls.get(path);
  if (!url) return null;

  const response = await fetch(url);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

export * from "./types";
