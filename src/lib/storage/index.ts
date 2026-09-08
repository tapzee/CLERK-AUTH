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

export * from "./types";
