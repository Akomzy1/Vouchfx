/**
 * POST /api/notifications/[id]/read — mark a single notification as read
 * POST /api/notifications/all/read  — mark all as read (id="all")
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const now = new Date().toISOString();

  if (id === "all") {
    await db
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
  } else {
    await db
      .from("notifications")
      .update({ read_at: now })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  return new NextResponse(null, { status: 204 });
}
