/**
 * GET  /api/channels — list user's enabled signal sources
 * POST /api/channels — create a new signal source (enable a channel)
 *
 * Uses RLS via the authenticated user session (no service role).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("signal_sources")
    .select("id, telegram_chat_id, title, is_enabled, daily_signal_limit, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { telegram_chat_id: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { telegram_chat_id, title } = body;
  if (!telegram_chat_id) {
    return NextResponse.json({ error: "telegram_chat_id is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("signal_sources")
    .insert({
      user_id: user.id,
      telegram_chat_id: parseInt(telegram_chat_id, 10),
      title: title ?? null,
      is_enabled: true,
    })
    .select("id, telegram_chat_id, title, is_enabled, daily_signal_limit, created_at")
    .single();

  if (error) {
    // Unique constraint — already added
    if (error.code === "23505") {
      return NextResponse.json({ error: "Channel already added" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ source: data }, { status: 201 });
}
