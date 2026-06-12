/**
 * GET  /api/notifications/preferences — list preferences (with defaults for missing rows)
 * PATCH /api/notifications/preferences — upsert a single preference
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOTIFY_EVENTS } from "@vouchfx/core";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .from("notification_preferences")
    .select("event_type, email_enabled, in_app_enabled, push_enabled")
    .eq("user_id", user.id);

  // Fill in defaults for events with no DB row
  const rowMap = new Map(
    ((rows ?? []) as { event_type: string; email_enabled: boolean; in_app_enabled: boolean; push_enabled: boolean }[])
      .map((r) => [r.event_type, r])
  );

  const preferences = NOTIFY_EVENTS.map((event) => ({
    event_type:    event,
    email_enabled:  rowMap.get(event)?.email_enabled  ?? true,
    in_app_enabled: rowMap.get(event)?.in_app_enabled ?? true,
    push_enabled:   rowMap.get(event)?.push_enabled   ?? true,
  }));

  return NextResponse.json({ preferences });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { event_type?: string; email_enabled?: boolean; in_app_enabled?: boolean; push_enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event_type, email_enabled, in_app_enabled, push_enabled } = body;

  if (!event_type || !(NOTIFY_EVENTS as readonly string[]).includes(event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }
  if (
    typeof email_enabled !== "boolean" &&
    typeof in_app_enabled !== "boolean" &&
    typeof push_enabled !== "boolean"
  ) {
    return NextResponse.json({ error: "Provide email_enabled, in_app_enabled or push_enabled" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { event_type, user_id: user.id };
  if (typeof email_enabled  === "boolean") updates.email_enabled  = email_enabled;
  if (typeof in_app_enabled === "boolean") updates.in_app_enabled = in_app_enabled;
  if (typeof push_enabled   === "boolean") updates.push_enabled   = push_enabled;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("notification_preferences")
    .upsert(updates, { onConflict: "user_id,event_type" })
    .select("event_type, email_enabled, in_app_enabled, push_enabled")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preference: data });
}
