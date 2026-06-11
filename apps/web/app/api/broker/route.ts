/**
 * GET  /api/broker — list user's broker connections
 * POST /api/broker — provision a new MT5/MT4 account via MetaApi, store in DB
 *
 * The MT5 credentials (login, password) are forwarded directly to MetaApi and
 * never stored in VouchFX's database. Only the MetaApi account ID is stored.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createMetaApiAccount,
  type MtPlatform,
  type MetaApiRegion,
} from "@/lib/broker/metaapi";
import { getEntitlements, type Plan } from "@vouchfx/core";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("broker_connections")
    .select("id, label, platform, is_active, status, server_hint, last_status_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connections: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "MetaApi not configured — set METAAPI_TOKEN" }, { status: 503 });
  }

  let body: {
    login: string;
    password: string;
    server: string;
    label?: string;
    platform?: MtPlatform;
    region?: MetaApiRegion;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { login, password, server } = body;
  if (!login || !password || !server) {
    return NextResponse.json(
      { error: "login, password, and server are required" },
      { status: 400 }
    );
  }

  // ── Plan gate: check broker account limit ────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [{ count: brokerCount }, { data: subRow }] = await Promise.all([
    db.from("broker_connections").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    db.from("subscriptions").select("plan, status").eq("user_id", user.id).in("status", ["trialing", "active", "past_due"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const plan = (subRow as { plan?: Plan } | null)?.plan ?? "trial";
  const { maxBrokerAccounts } = getEntitlements(plan);
  if (maxBrokerAccounts > 0 && (brokerCount ?? 0) >= maxBrokerAccounts) {
    return NextResponse.json(
      { error: `Your ${plan} plan allows ${maxBrokerAccounts} broker account${maxBrokerAccounts > 1 ? "s" : ""}. Upgrade to add more.`, code: "plan_limit" },
      { status: 403 }
    );
  }

  const platform: MtPlatform = body.platform ?? "mt5";
  const region: MetaApiRegion = body.region ?? "new-york";
  const label = body.label?.trim() || `MT5 ${login}`;

  let metaApiAccountId: string;
  try {
    metaApiAccountId = await createMetaApiAccount({
      token,
      login,
      password,
      server,
      name: `VouchFX — ${label}`,
      platform,
      region,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Store the connection — credentials are NOT stored; only the MetaApi ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conn, error: dbErr } = await (supabase as any)
    .from("broker_connections")
    .insert({
      user_id: user.id,
      metaapi_account_id: metaApiAccountId,
      platform: platform.toUpperCase(),
      label,
      is_active: true,
      status: "deploying",
      server_hint: server,
    })
    .select("id, label, platform, is_active, status, server_hint, created_at")
    .single();

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ connection: conn }, { status: 201 });
}
