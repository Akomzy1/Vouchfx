/**
 * RLS isolation tests — P1.1 exit criterion.
 *
 * Proves that two distinct authenticated users cannot read each other's rows
 * across every RLS-protected table.
 *
 * Requirements:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.
 *   SUPABASE_ANON_KEY must be set (used to build user-scoped clients).
 *   Run against the real Supabase project (not a mock).
 *
 * Run:
 *   pnpm --filter @vouchfx/db test
 */

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@vouchfx/config";
import { createAdminClientFromEnv, type TypedClient } from "../client";
import type { Database } from "../types";

// ── Setup ─────────────────────────────────────────────────────────────────────

const env = parseEnv();

const skip = !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY;

/** Create a Supabase client scoped to a specific user's JWT. */
function userClient(jwt: string): TypedClient {
  return createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

// Seed state shared across tests
let adminDb: TypedClient;
let userAId: string;
let userBId: string;
let jwtA: string;
let jwtB: string;
let clientA: TypedClient;
let clientB: TypedClient;

// Seed UUIDs for owned rows
let sourceAId: string;
let sourceBId: string;
let brokerAId: string;
let brokerBId: string;

beforeAll(async () => {
  if (skip) return;

  adminDb = createAdminClientFromEnv(env);

  // Create two test users via the Auth admin API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminDb.auth as any;

  const { data: userAData, error: errA } = await admin.admin.createUser({
    email: `rls-test-a-${Date.now()}@vouchfx.test`,
    password: "test-password-A-123!",
    email_confirm: true,
  });
  if (errA) throw new Error(`createUser A: ${JSON.stringify(errA)}`);
  userAId = userAData.user.id;

  const { data: userBData, error: errB } = await admin.admin.createUser({
    email: `rls-test-b-${Date.now()}@vouchfx.test`,
    password: "test-password-B-123!",
    email_confirm: true,
  });
  if (errB) throw new Error(`createUser B: ${JSON.stringify(errB)}`);
  userBId = userBData.user.id;

  // Sign in as each user to get JWTs
  const anonClient = createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  const { data: signInA, error: signInErrA } = await anonClient.auth.signInWithPassword({
    email: userAData.user.email!,
    password: "test-password-A-123!",
  });
  if (signInErrA) throw new Error(`signIn A: ${JSON.stringify(signInErrA)}`);
  jwtA = signInA.session!.access_token;
  clientA = userClient(jwtA);

  const { data: signInB, error: signInErrB } = await anonClient.auth.signInWithPassword({
    email: userBData.user.email!,
    password: "test-password-B-123!",
  });
  if (signInErrB) throw new Error(`signIn B: ${JSON.stringify(signInErrB)}`);
  jwtB = signInB.session!.access_token;
  clientB = userClient(jwtB);

  // Seed owned rows for each user via service role (bypasses RLS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = adminDb as any;

  const { data: brokerA } = await db.from("broker_connections").insert({
    user_id: userAId,
    metaapi_account_id: "test-meta-a",
    platform: "MT5",
    label: "User A broker",
  }).select("id").single();
  brokerAId = brokerA.id;

  const { data: brokerB } = await db.from("broker_connections").insert({
    user_id: userBId,
    metaapi_account_id: "test-meta-b",
    platform: "MT5",
    label: "User B broker",
  }).select("id").single();
  brokerBId = brokerB.id;

  const { data: sourceA } = await db.from("signal_sources").insert({
    user_id: userAId,
    telegram_chat_id: -1001111111111,
    title: "User A channel",
  }).select("id").single();
  sourceAId = sourceA.id;

  const { data: sourceB } = await db.from("signal_sources").insert({
    user_id: userBId,
    telegram_chat_id: -1002222222222,
    title: "User B channel",
  }).select("id").single();
  sourceBId = sourceB.id;

  // Seed risk_settings for both users
  await db.from("risk_settings").insert({ user_id: userAId });
  await db.from("risk_settings").insert({ user_id: userBId });

  // Seed audit_events for both users
  await db.from("audit_events").insert({ user_id: userAId, event_type: "received", payload: { test: "a" } });
  await db.from("audit_events").insert({ user_id: userBId, event_type: "received", payload: { test: "b" } });
});

afterAll(async () => {
  if (skip || !adminDb) return;

  // Delete test users (cascades to all owned rows)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = (adminDb as any).auth.admin;
  if (userAId) await admin.deleteUser(userAId);
  if (userBId) await admin.deleteUser(userBId);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe.skipIf(skip)("RLS isolation — two users cannot see each other's data", () => {

  it("users: each user sees only their own profile row", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rowsA } = await (clientA as any).from("users").select("id");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rowsB } = await (clientB as any).from("users").select("id");

    const idsA = (rowsA ?? []).map((r: { id: string }) => r.id);
    const idsB = (rowsB ?? []).map((r: { id: string }) => r.id);

    expect(idsA).toContain(userAId);
    expect(idsA).not.toContain(userBId);

    expect(idsB).toContain(userBId);
    expect(idsB).not.toContain(userAId);
  });

  it("broker_connections: user A cannot see user B's broker", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (clientA as any).from("broker_connections").select("id");
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(brokerAId);
    expect(ids).not.toContain(brokerBId);
  });

  it("broker_connections: user B cannot see user A's broker", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (clientB as any).from("broker_connections").select("id");
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(brokerBId);
    expect(ids).not.toContain(brokerAId);
  });

  it("signal_sources: each user sees only their own sources", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dataA } = await (clientA as any).from("signal_sources").select("id");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dataB } = await (clientB as any).from("signal_sources").select("id");

    const idsA = (dataA ?? []).map((r: { id: string }) => r.id);
    const idsB = (dataB ?? []).map((r: { id: string }) => r.id);

    expect(idsA).toContain(sourceAId);
    expect(idsA).not.toContain(sourceBId);

    expect(idsB).toContain(sourceBId);
    expect(idsB).not.toContain(sourceAId);
  });

  it("risk_settings: each user sees only their own settings", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dataA } = await (clientA as any).from("risk_settings").select("user_id");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dataB } = await (clientB as any).from("risk_settings").select("user_id");

    const uidsA = (dataA ?? []).map((r: { user_id: string }) => r.user_id);
    const uidsB = (dataB ?? []).map((r: { user_id: string }) => r.user_id);

    expect(uidsA).toContain(userAId);
    expect(uidsA).not.toContain(userBId);

    expect(uidsB).toContain(userBId);
    expect(uidsB).not.toContain(userAId);
  });

  it("audit_events: each user sees only their own events", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dataA } = await (clientA as any).from("audit_events").select("user_id");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dataB } = await (clientB as any).from("audit_events").select("user_id");

    const uidsA = (dataA ?? []).map((r: { user_id: string }) => r.user_id);
    const uidsB = (dataB ?? []).map((r: { user_id: string }) => r.user_id);

    expect(uidsA.every((id: string) => id === userAId)).toBe(true);
    expect(uidsB.every((id: string) => id === userBId)).toBe(true);
  });

  it("audit_events: authenticated users cannot INSERT (append-only via service role)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (clientA as any).from("audit_events").insert({
      user_id: userAId,
      event_type: "received",
      payload: { test: "should_fail" },
    });
    // RLS has no INSERT policy for authenticated users → permission denied
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501"); // insufficient_privilege
  });

  it("broker_connections: user A cannot INSERT a row for user B", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (clientA as any).from("broker_connections").insert({
      user_id: userBId, // ← wrong user
      metaapi_account_id: "should-be-blocked",
      platform: "MT5",
    });
    // WITH CHECK (auth.uid() = user_id) blocks this
    expect(error).not.toBeNull();
  });

  it("broker_connections: user A cannot DELETE user B's broker", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (clientA as any)
      .from("broker_connections")
      .delete()
      .eq("id", brokerBId);
    // USING (auth.uid() = user_id) means this matches 0 rows — no error, but
    // verify the row still exists via service role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (adminDb as any)
      .from("broker_connections")
      .select("id")
      .eq("id", brokerBId)
      .maybeSingle();
    expect(data).not.toBeNull();
    expect(error).toBeNull(); // RLS silently filters — no error, just 0 rows deleted
  });
});

describe.skipIf(!skip)("RLS tests skipped", () => {
  it("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY not set — skipping RLS tests", () => {
    console.warn("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY to run RLS isolation tests.");
    expect(true).toBe(true);
  });
});
