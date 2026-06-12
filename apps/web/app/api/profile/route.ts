import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { full_name?: unknown } | null;
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  if (fullName.length === 0 || fullName.length > 80) {
    return NextResponse.json({ error: "Enter a name (max 80 characters)." }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { error } = await db.from("users").update({ full_name: fullName }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep auth metadata in sync (Google sign-ins read from here too)
  await supabase.auth.updateUser({ data: { full_name: fullName } });

  return NextResponse.json({ ok: true });
}
