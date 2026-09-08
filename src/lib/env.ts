/**
 * Server-side environment access.
 *
 * Every read goes through here so a missing variable fails loudly at the call
 * site instead of turning into a confusing "Invalid API key" from the provider.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const serverEnv = {
  // Supabase — always used for the photo metadata table.
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  /**
   * The secret key (`sb_secret_...`, previously called `service_role`).
   *
   * Not the publishable key: that one is meant for browsers and is blocked by
   * the RLS policies in supabase/schema.sql, so it cannot read the `photos`
   * table or write to the private bucket.
   */
  get supabaseSecretKey() {
    const key =
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {
      throw new Error(
        "Missing SUPABASE_SECRET_KEY. Get it from the Supabase dashboard under " +
          "Project Settings -> API Keys -> Secret keys (it starts with sb_secret_).",
      );
    }
    if (key.startsWith("sb_publishable_")) {
      throw new Error(
        "SUPABASE_SECRET_KEY is set to a publishable key. That key is for " +
          "browsers and cannot write to the private photos bucket. Use the " +
          "secret key (sb_secret_...) instead.",
      );
    }
    return key;
  },
  get photosBucket() {
    return process.env.SUPABASE_PHOTOS_BUCKET ?? "photos";
  },

  // Cloudinary — only read when STORAGE_PROVIDER=cloudinary.
  get cloudinaryCloudName() {
    return required("CLOUDINARY_CLOUD_NAME");
  },
  get cloudinaryApiKey() {
    return required("CLOUDINARY_API_KEY");
  },
  get cloudinaryApiSecret() {
    return required("CLOUDINARY_API_SECRET");
  },
  get cloudinaryFolder() {
    return process.env.CLOUDINARY_FOLDER ?? "live-photos";
  },
};
