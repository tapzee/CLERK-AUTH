export const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedType = keyof typeof ALLOWED_TYPES;

export type ProviderName = "supabase" | "cloudinary";

export type UploadInput = {
  /** Clerk user id. The folder of last resort when no prefix is given. */
  userId: string;
  /**
   * The folder to store under.
   *
   * Usually the owner's email address, so the bucket can be read by a human --
   * see `storageFolderFor` in `lib/photos.ts`. Company assets (a uniform
   * reference photo, say) belong to the business rather than to whoever
   * uploaded them, and pass their own prefix instead. Always chosen on the
   * server; a client can never supply it.
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
