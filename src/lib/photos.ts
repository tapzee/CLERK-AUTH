import "server-only";

import type { CaptureMethod, LocationInput } from "@/lib/geo";
import {
  ALLOWED_TYPES,
  activeProvider,
  providerFor,
  StorageError,
  type AllowedType,
  type ProviderName,
} from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Vercel rejects request bodies over 4.5 MB at the edge, before the function
 * ever runs — the caller would get an opaque platform 413 instead of the
 * message below. Staying under that ceiling keeps the failure ours to explain.
 * A 1280x720 JPEG at quality 0.92 lands around 300 KB, so this is generous.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * Why a photo was taken. Attendance evidence shares this table so it inherits
 * the storage-provider abstraction and per-user pathing, but it is kept out of
 * the personal gallery — see `listPhotos`.
 */
export type PhotoPurpose = "personal" | "attendance";

export type PhotoRow = {
  id: string;
  user_id: string;
  provider: ProviderName;
  storage_path: string;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  captured_at: string;
  created_at: string;
  // Where the device said it was. Null when the user denied location or no fix
  // arrived before the shutter.
  latitude: number | null;
  longitude: number | null;
  /** Confidence radius in metres; large values mean a coarse Wi-Fi/IP guess. */
  accuracy_m: number | null;
  altitude_m: number | null;
  location_error: string | null;
  capture_method: CaptureMethod;
  purpose: PhotoPurpose;
};

export type PhotoWithUrl = PhotoRow & { url: string | null };

/**
 * Trusting the browser's `File.type` alone would let a caller label anything as
 * an image, so the first bytes are checked against the real signature too.
 */
export function sniffImageType(bytes: Uint8Array): AllowedType | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, i) => bytes[i] === byte)) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP"
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));
  if (riff === "RIFF" && webp === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** An upload that has been read into memory and proven to be a real image. */
export type VerifiedImage = {
  bytes: Uint8Array;
  contentType: AllowedType;
};

/**
 * Reads an upload into memory and checks it is what it claims to be.
 *
 * Split out from `storePhoto` because the punch route needs the same bytes
 * twice -- once to ask the model about the uniform, once to store the evidence
 * -- and reading a multipart body a second time is not possible.
 */
export async function verifyImageUpload(file: File): Promise<VerifiedImage> {
  if (file.size === 0) {
    throw new StorageError("The uploaded photo is empty.", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new StorageError(
      `Photo is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) {
    throw new StorageError("Only JPEG, PNG, and WebP images are accepted.", 415);
  }
  if (file.type && file.type !== contentType) {
    throw new StorageError("The file contents do not match its declared type.", 415);
  }

  return { bytes, contentType };
}

type PhotoMetadata = {
  userId: string;
  width?: number | null;
  height?: number | null;
  capturedAt?: string | null;
  location?: LocationInput | null;
  captureMethod?: CaptureMethod;
  purpose?: PhotoPurpose;
};

type StorePhotoInput = PhotoMetadata & { file: File };

/**
 * Validates the incoming capture, writes it to the active storage provider
 * under a per-user path, then records a row pointing at it.
 */
export async function storePhoto({ file, ...metadata }: StorePhotoInput): Promise<PhotoRow> {
  return storeVerifiedPhoto(await verifyImageUpload(file), metadata);
}

/** The half of `storePhoto` that runs once the bytes are already in hand. */
export async function storeVerifiedPhoto(
  { bytes, contentType }: VerifiedImage,
  {
    userId,
    width,
    height,
    capturedAt,
    location,
    captureMethod = "manual",
    purpose = "personal",
  }: PhotoMetadata,
): Promise<PhotoRow> {
  const provider = activeProvider();
  const { path } = await provider.upload({
    userId,
    bytes,
    contentType,
    extension: ALLOWED_TYPES[contentType],
  });

  const { data, error } = await supabaseAdmin()
    .from("photos")
    .insert({
      user_id: userId,
      provider: provider.name,
      storage_path: path,
      content_type: contentType,
      byte_size: bytes.byteLength,
      width: width ?? null,
      height: height ?? null,
      captured_at: capturedAt ?? new Date().toISOString(),
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy_m: location?.accuracyM ?? null,
      altitude_m: location?.altitudeM ?? null,
      location_error: location?.error ?? null,
      capture_method: captureMethod,
      purpose,
    })
    .select()
    .single<PhotoRow>();

  if (error || !data) {
    // Don't leave an orphaned object behind if the metadata write fails.
    await provider.remove([path]);
    throw new StorageError(`Could not save photo metadata: ${error?.message}`, 502);
  }

  return data;
}

/** Identifies a stored object across providers, for the lookup map below. */
function objectKey(provider: string, path: string) {
  return `${provider}:${path}`;
}

/**
 * Lists the caller's photos, each with a freshly minted readable URL.
 *
 * Defaults to personal captures: attendance evidence lives in the same table
 * but belongs to the manager's view, not the staff member's gallery.
 */
export async function listPhotos(
  userId: string,
  limit = 60,
  purpose: PhotoPurpose = "personal",
): Promise<PhotoWithUrl[]> {
  const { data, error } = await supabaseAdmin()
    .from("photos")
    .select("*")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .order("captured_at", { ascending: false })
    .limit(limit)
    .returns<PhotoRow[]>();

  if (error) {
    throw new StorageError(`Could not load photos: ${error.message}`, 502);
  }
  if (!data?.length) return [];

  // Rows may span providers if STORAGE_PROVIDER was changed at some point.
  const byProvider = new Map<string, string[]>();
  for (const photo of data) {
    const paths = byProvider.get(photo.provider) ?? [];
    paths.push(photo.storage_path);
    byProvider.set(photo.provider, paths);
  }

  const urls = new Map<string, string | null>();
  await Promise.all(
    [...byProvider].map(async ([name, paths]) => {
      const resolved = await providerFor(name).signedUrls(paths);
      for (const [path, url] of resolved) {
        urls.set(objectKey(name, path), url);
      }
    }),
  );

  return data.map((photo) => ({
    ...photo,
    url: urls.get(objectKey(photo.provider, photo.storage_path)) ?? null,
  }));
}

/** Deletes one photo, but only if it belongs to the calling user. */
export async function deletePhoto(userId: string, photoId: string): Promise<void> {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("photos")
    .select("provider, storage_path")
    .eq("id", photoId)
    .eq("user_id", userId)
    .maybeSingle<Pick<PhotoRow, "provider" | "storage_path">>();

  if (error) {
    throw new StorageError(`Could not look up photo: ${error.message}`, 502);
  }
  if (!data) {
    throw new StorageError("Photo not found.", 404);
  }

  await providerFor(data.provider).remove([data.storage_path]);
  await supabase.from("photos").delete().eq("id", photoId).eq("user_id", userId);
}
