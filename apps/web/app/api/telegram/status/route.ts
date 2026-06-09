/**
 * GET /api/telegram/status
 * Returns the current Telegram session status for the authenticated user.
 *
 * Response:
 *   { status: 'active' | 'limited' | 'banned' | 'disconnected' | 'none', last_connected_at?: string }
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/telegram/auth-user";
import { adminDb } from "@/lib/telegram/gramjs";

export const runtime = "nodejs";

export async function GET() {
  const userResult = await requireUser();
  if (userResult instanceof NextResponse) return userResult;
  const { userId } = userResult;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = adminDb() as any;
  const { data, error } = await db
    .from("telegram_sessions")
    .select("status, last_connected_at, api_hash_hint")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ status: "none" });

  return NextResponse.json({
    status: data.status,
    last_connected_at: data.last_connected_at,
  });
}
