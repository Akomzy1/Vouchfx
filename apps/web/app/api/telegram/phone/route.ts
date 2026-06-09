/**
 * POST /api/telegram/phone
 * Step 1 of phone+code auth: send a verification code to the given phone number.
 *
 * Body: { phoneNumber: string }
 * Response: { success: true } | { error: string }
 */
import { NextResponse } from "next/server";
import { Api } from "telegram";
import { requireUser } from "@/lib/telegram/auth-user";
import {
  requireTelegramEnv,
  createGramJsClient,
  adminDb,
} from "@/lib/telegram/gramjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userResult = await requireUser();
  if (userResult instanceof NextResponse) return userResult;
  const { userId } = userResult;

  let client;
  try {
    const body = await request.json();
    const phoneNumber: string = (body.phoneNumber ?? "").trim();
    if (!phoneNumber) {
      return NextResponse.json({ error: "phoneNumber is required" }, { status: 400 });
    }

    const env = requireTelegramEnv();
    client = createGramJsClient(env);
    await client.connect();

    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber,
        apiId: env.apiId,
        apiHash: env.apiHash,
        settings: new Api.CodeSettings({}),
      })
    );

    const phoneCodeHash = (result as Api.auth.SentCode).phoneCodeHash;
    // Save partial session (MTProto auth key) so verify step reconnects to same DC
    const sessionData = (client.session.save() as unknown as string) ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adminDb() as any;
    const { error: upsertErr } = await db.from("telegram_auth_pending").upsert(
      {
        user_id: userId,
        phone_number: phoneNumber,
        phone_code_hash: phoneCodeHash,
        session_data: sessionData,
      },
      { onConflict: "user_id" }
    );
    if (upsertErr) throw new Error(upsertErr.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    try { await client?.disconnect(); } catch { /* ignore */ }
  }
}
