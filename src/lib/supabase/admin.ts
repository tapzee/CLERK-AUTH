import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";

/**
 * Supabase client authenticated with the secret key.
 *
 * `server-only` makes the build fail if this module is ever pulled into a
 * client bundle. The service role key bypasses Row Level Security, so every
 * caller is responsible for scoping queries to the signed-in Clerk user.
 */
let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
