/**
 * POST /api/telegram/verify
 * Step 2 of phone+code auth: submit the Telegram verification code.
 *
 * Body: { code: string }
 * Response:
 *   { success: true }             — authenticated, session stored
 *   { twoFaNeeded: true }         — 2FA password required; call /api/telegram/2fa next
 *   { error: string }
 */
import { NextResponse } from "next/server";
import { Api } from "telegram";
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
    const code: string = (body.code ?? "").trim();
    if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

    // Load pending auth state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adminDb() as any;
    const { data: pending, error: fetchErr } = await db
      .from("telegram_auth_pending")
      .select("phone_number, phone_code_hash, session_data")
      .eq("user_id", userId)
      .single();

    if (fetchErr || !pending) {
      return NextResponse.json(
        { error: "No pending auth — start with /api/telegram/phone first" },
        { status: 400 }
      );
    }

    const env = requireTelegramEnv();
    client = createGramJsClient(env, pending.session_data ?? "");
    await client.connect();

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: pending.phone_number,
          phoneCodeHash: pending.phone_code_hash,
          phoneCode: code,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("SESSION_PASSWORD_NEEDED")) {
        // Save session state so the 2FA step can continue from here
        const sessionDataAfter = (client.session.save() as unknown as string) ?? "";
        await db
          .from("telegram_auth_pending")
          .update({ session_data: sessionDataAfter })
          .eq("user_id", userId);
        await client.disconnect();
        return NextResponse.json({ twoFaNeeded: true });
      }

      // PHONE_CODE_INVALID, PHONE_CODE_EXPIRED, etc.
      await client.disconnect();
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Auth succeeded — store encrypted session
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
