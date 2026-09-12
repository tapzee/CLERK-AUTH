import "server-only";

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import { serverEnv } from "@/lib/env";
import { StorageError, type StorageProvider, type UploadInput } from "./types";

let configured = false;

function client() {
  if (!configured) {
    cloudinary.config({
      cloud_name: serverEnv.cloudinaryCloudName,
      api_key: serverEnv.cloudinaryApiKey,
      api_secret: serverEnv.cloudinaryApiSecret,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

/**
 * Assets are uploaded with `type: "authenticated"`, so they are not readable
 * from the plain delivery URL — every read needs a signature generated with the
 * API secret, which stays on the server.
 */
export const cloudinaryStorage: StorageProvider = {
  name: "cloudinary",

  async upload({ userId, pathPrefix, bytes, extension }: UploadInput) {
    const folder = `${serverEnv.cloudinaryFolder}/${pathPrefix ?? userId}`;

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = client().uploader.upload_stream(
        {
          folder,
          public_id: crypto.randomUUID(),
          resource_type: "image",
          type: "authenticated",
          format: extension,
          overwrite: false,
        },
        (error, response) => {
          if (error || !response) {
            reject(new StorageError(`Cloudinary upload failed: ${error?.message}`, 502));
            return;
          }
          resolve(response);
        },
      );
      stream.end(Buffer.from(bytes));
    });

    // public_id already includes the per-user folder, so it round-trips as the path.
    return { path: result.public_id };
  },

  async signedUrls(paths) {
    return new Map(
      paths.map((path) => [
        path,
        client().url(path, {
          type: "authenticated",
          resource_type: "image",
          sign_url: true,
          secure: true,
        }),
      ]),
    );
  },

  async remove(paths) {
    if (paths.length === 0) return;
    await client().api.delete_resources(paths, {
      resource_type: "image",
      type: "authenticated",
    });
  },
};
