import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "./types";

export type TypedClient = SupabaseClient<Database>;

/**
 * Server-side admin client (service-role key).
 * Only for worker and server-action use. Never expose to the browser.
 * RLS is bypassed — all access is controlled in application logic.
 */
export function createSupabaseAdminClient(
  supabaseUrl: string,
  serviceRoleKey: string
): TypedClient {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

/**
 * Browser-safe client (anon key).
 * All access governed by Postgres RLS policies.
 */
export function createSupabaseBrowserClient(
  supabaseUrl: string,
  anonKey: string
): TypedClient {
  return createClient<Database>(supabaseUrl, anonKey);
}

/**
 * Convenience: admin client built from pre-validated env.
 * Use in Node workers (listener, executor) after calling parseEnv().
 */
export function createAdminClientFromEnv(env: {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}): TypedClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use the admin client"
    );
  }
  return createSupabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
