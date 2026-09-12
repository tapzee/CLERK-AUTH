export const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedType = keyof typeof ALLOWED_TYPES;

export type ProviderName = "supabase" | "cloudinary";

export type UploadInput = {
  /** Clerk user id. Providers must scope the stored object under it. */
  userId: string;
  /**
   * Overrides the per-user folder.
   *
   * Company assets — a uniform reference photo, say — belong to the business
   * rather than to whoever happened to upload them, so they live outside the
   * per-user prefix. Still chosen on the server; a client can never supply it.
   */
  pathPrefix?: string;
  bytes: Uint8Array;
  contentType: AllowedType;
  extension: string;
};

/**
 * A place captured photos can live. Both implementations keep objects private
 * and hand back short-lived or signature-protected URLs for reading.
 */
export interface StorageProvider {
  readonly name: ProviderName;
  upload(input: UploadInput): Promise<{ path: string }>;
  /** Maps each stored path to a readable URL, or null if one can't be made. */
  signedUrls(paths: string[]): Promise<Map<string, string | null>>;
  remove(paths: string[]): Promise<void>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
