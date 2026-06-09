/**
 * POST /api/telegram/2fa
 * Step 3 (conditional) of phone+code auth: submit the 2FA cloud password.
 * Only needed when /api/telegram/verify returned { twoFaNeeded: true }.
 *
 * Body: { password: string }
 * Response: { success: true } | { error: string }
 */
import { NextResponse } from "next/server";
import { Api } from "telegram";
import { computeCheck } from "telegram/Password";
import { requireUser } from "@/lib/telegram/auth-user";
import {
  requireTelegramEnv,
  createGramJsClient,
  adminDb,
  storeSession,
  clearPendingAuth,
} from "@/lib/telegram/gramjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userResult = await requireUser();
  if (userResult instanceof NextResponse) return userResult;
  const { userId } = userResult;

  let client;
  try {
    const body = await request.json();
    const password: string = body.password ?? "";
    if (!password) return NextResponse.json({ error: "password is required" }, { status: 400 });

    // Load pending state (session_data was updated by /verify to capture 2FA state)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adminDb() as any;
    const { data: pending, error: fetchErr } = await db
      .from("telegram_auth_pending")
      .select("phone_number, phone_code_hash, session_data")
      .eq("user_id", userId)
      .single();

    if (fetchErr || !pending) {
      return NextResponse.json({ error: "No pending 2FA state found" }, { status: 400 });
    }

    const env = requireTelegramEnv();
    client = createGramJsClient(env, pending.session_data ?? "");
    await client.connect();

    // Get 2FA parameters from Telegram
    const pwResult = await client.invoke(new Api.account.GetPassword());
    // Compute SRP answer
    const inputCheck = await computeCheck(pwResult as Api.account.Password, password);
    await client.invoke(new Api.auth.CheckPassword({ password: inputCheck }));

    // Store the authenticated session
    const sessionString = (client.session.save() as unknown as string) ?? "";
    await storeSession(
      userId,
      sessionString,
      env.apiId,
      env.apiHash.slice(0, 4),
      env.encryptionKey
    );
    await clearPendingAuth(userId);
    await client.disconnect();

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client?.disconnect(); } catch { /* ignore */ }
    // PASSWORD_HASH_INVALID = wrong password
    const status = msg.includes("INVALID") || msg.includes("Wrong") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
