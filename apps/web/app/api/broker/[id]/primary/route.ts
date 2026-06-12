/**
 * POST /api/broker/[id]/primary — make this broker connection the primary one.
 *
 * The primary connection is where new signals route. Exactly one per user
 * (enforced by a partial unique index), so we clear the existing primary
 * before setting the new one. RLS scopes every statement to auth.uid().
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Confirm the target belongs to the user and is usable.
  const { data: target } = await db
    .from("broker_connections")
    .select("id, is_active")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!target.is_active) {
    return NextResponse.json({ error: "Account is inactive — reconnect it before making it primary." }, { status: 422 });
  }

  // Clear the current primary first (partial unique index allows only one),
  // then promote the target. Skip the target in the clear so a no-op stays clean.
  const { error: clearErr } = await db
    .from("broker_connections")
    .update({ is_primary: false })
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .neq("id", id);
  if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 });

  const { error: setErr } = await db
    .from("broker_connections")
    .update({ is_primary: true })
    .eq("id", id)
    .eq("user_id", user.id);
  if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, primary_id: id });
}
