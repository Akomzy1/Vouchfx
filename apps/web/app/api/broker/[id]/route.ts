/**
 * DELETE /api/broker/[id] — remove a broker connection
 *
 * Removes the MetaApi account from MetaApi, then deletes the DB row.
 * If the MetaApi deletion fails (e.g. already gone), the DB row is still removed.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteMetaApiAccount } from "@/lib/broker/metaapi";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the row (RLS ensures it belongs to this user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conn, error: fetchErr } = await (supabase as any)
    .from("broker_connections")
    .select("id, metaapi_account_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const token = process.env.METAAPI_TOKEN;
  if (token && conn.metaapi_account_id) {
    try {
      await deleteMetaApiAccount(token, conn.metaapi_account_id as string);
    } catch (err) {
      // Log but don't block — clean up the DB row regardless
      console.error(`[broker] MetaApi delete failed for ${conn.metaapi_account_id}:`, (err as Error).message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delErr } = await (supabase as any)
    .from("broker_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
