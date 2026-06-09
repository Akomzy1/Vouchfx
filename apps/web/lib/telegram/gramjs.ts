/**
 * Server-side GramJS helpers for Telegram connect flow.
 * Import only in API routes (Node.js runtime).
 * Never log session strings, phone_code_hash, or api_hash in full.
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { encryptSession, decryptSession } from "@vouchfx/core";
import type { Database } from "@vouchfx/db";

export interface TelegramEnv {
  apiId: number;
  apiHash: string;
  encryptionKey: string;
}

export function requireTelegramEnv(): TelegramEnv {
  const apiId = parseInt(process.env.TELEGRAM_API_ID ?? "", 10);
  const apiHash = process.env.TELEGRAM_API_HASH ?? "";
  const encryptionKey = process.env.ENCRYPTION_KEY ?? "";

  if (!apiId || !apiHash) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set");
  }
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY must be set");
  }
  return { apiId, apiHash, encryptionKey };
}

export function createGramJsClient(
  { apiId, apiHash }: Pick<TelegramEnv, "apiId" | "apiHash">,
  sessionData = ""
): TelegramClient {
  return new TelegramClient(new StringSession(sessionData), apiId, apiHash, {
    connectionRetries: 3,
    requestRetries: 3,
    autoReconnect: false,
    baseLogger: { levels: [], log: () => {} } as never,
  });
}

/** Service-role Supabase client for API routes. */
export function adminDb() {
  return createSupabaseAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Encrypt + upsert a session string into telegram_sessions. */
export async function storeSession(
  userId: string,
  sessionString: string,
  apiId: number,
  apiHashHint: string,
  encryptionKey: string
): Promise<void> {
  const encrypted = encryptSession(sessionString, encryptionKey);
  const db = adminDb() as ReturnType<typeof adminDb> & { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from("telegram_sessions")
    .upsert(
      {
        user_id: userId,
        session_string_encrypted: encrypted,
        api_id: apiId,
        api_hash_hint: apiHashHint,
        status: "active",
        last_connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(`Failed to store session: ${error.message}`);
}

/** Delete pending auth state after completion or failure. */
export async function clearPendingAuth(userId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (adminDb() as any).from("telegram_auth_pending").delete().eq("user_id", userId);
}

/**
 * Load and decrypt the user's stored Telegram session from the DB.
 * Returns null if no session exists.
 * The returned sessionString is only in caller scope — never log it.
 */
export async function loadUserSession(
  userId: string,
  encryptionKey: string
): Promise<{ sessionString: string; apiId: number } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminDb() as any)
    .from("telegram_sessions")
    .select("session_string_encrypted, api_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  try {
    const sessionString = decryptSession(
      data.session_string_encrypted as string,
      encryptionKey
    );
    return { sessionString, apiId: data.api_id as number };
  } catch {
    return null;
  }
}
