/**
 * Loads and decrypts Telegram session strings from the database.
 *
 * Credentials are decrypted in-memory only — never logged, never put in queues.
 * P1.4 will extend this into a full pool manager (user_id → GramJS client).
 */
import { createClient } from "@supabase/supabase-js";
import { decryptSession } from "@vouchfx/core";
import { parseEnv } from "@vouchfx/config";

export interface LoadedSession {
  userId: string;
  sessionString: string;
  apiId: number;
}

/**
 * Load one user's decrypted session from the database.
 * Throws if the session is not found or decryption fails.
 */
export async function loadSessionFromDb(userId: string): Promise<LoadedSession> {
  const env = parseEnv();

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to load sessions from DB");
  }
  if (!env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY is required to decrypt sessions");
  }

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("telegram_sessions")
    .select("session_string_encrypted, api_id, status")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error(`No telegram session found for user ${userId}: ${error?.message ?? "not found"}`);
  }
  if (data.status === "banned") {
    throw new Error(`Telegram session for user ${userId} is banned`);
  }

  // Decrypt — result is only in this function's scope; never logged
  const sessionString = decryptSession(data.session_string_encrypted, env.ENCRYPTION_KEY);

  return { userId, sessionString, apiId: data.api_id };
}

/**
 * Update the session status in the database.
 * Called by the listener when Telegram reports SpamBot/limited state.
 */
export async function updateSessionStatus(
  userId: string,
  status: "active" | "limited" | "banned" | "disconnected"
): Promise<void> {
  const env = parseEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from("telegram_sessions")
    .update({ status, last_connected_at: new Date().toISOString() })
    .eq("user_id", userId);
}
