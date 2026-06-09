/**
 * GET /api/broker/[id]/status
 *
 * Polls MetaApi for the current deployment + connection state of a broker
 * account. Updates broker_connections.status in the DB if it has changed.
 * Called by the UI on an interval while status is "deploying".
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMetaApiAccountState, mapMetaApiStatus } from "@/lib/broker/metaapi";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conn, error: fetchErr } = await (supabase as any)
    .from("broker_connections")
    .select("id, metaapi_account_id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const token = process.env.METAAPI_TOKEN;
  if (!token || !conn.metaapi_account_id) {
    return NextResponse.json({ status: conn.status as string });
  }

  let newStatus = conn.status as string;
  try {
    const { state, connectionStatus } = await getMetaApiAccountState(
      token,
      conn.metaapi_account_id as string
    );
    newStatus = mapMetaApiStatus(state, connectionStatus);

    // Persist if changed
    if (newStatus !== conn.status) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("broker_connections")
        .update({ status: newStatus, last_status_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id);
    }

    return NextResponse.json({ status: newStatus, state, connectionStatus });
  } catch (err) {
    // MetaApi unreachable — return last known status
    return NextResponse.json({ status: conn.status as string, error: (err as Error).message });
  }
}
