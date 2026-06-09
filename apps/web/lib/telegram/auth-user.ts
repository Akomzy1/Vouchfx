import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Resolve authenticated user from cookie session. Returns userId or a 401 Response. */
export async function requireUser(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { userId: user.id };
}
