/**
 * POST /api/push/test — send a test push to all of the current user's devices.
 * Used by Settings right after the user enables push, to confirm delivery.
 *
 * Node runtime: pulls in @vouchfx/core/push (node:crypto). Server-only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createPushSender } from "@vouchfx/core/push";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sender = createPushSender(createServiceClient(), {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
  });
  if (!sender) {
    return NextResponse.json({ error: "Push is not configured on the server." }, { status: 503 });
  }

  await sender(user.id, {
    title: "VouchFX push is on",
    body: "You'll get alerts here even when the app is closed.",
    event: "trade_opened",
    url: "/dashboard",
  });

  return NextResponse.json({ ok: true });
}
