/**
 * DELETE /api/telegram/disconnect
 * Remove the user's Telegram session from the database.
 * The listener worker will detect the missing session and stop that client.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/telegram/auth-user";
import { adminDb } from "@/lib/telegram/gramjs";

export const runtime = "nodejs";

export async function DELETE() {
  const userResult = await requireUser();
  if (userResult instanceof NextResponse) return userResult;
  const { userId } = userResult;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = adminDb() as any;
  const { error } = await db
    .from("telegram_sessions")
    .delete()
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also clear any pending auth state
  await db.from("telegram_auth_pending").delete().eq("user_id", userId);

  return NextResponse.json({ success: true });
}
