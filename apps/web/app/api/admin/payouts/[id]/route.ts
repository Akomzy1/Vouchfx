/**
 * POST /api/admin/payouts/[id] — settle a payout request (VCH-ADMIN-02).
 *
 * Body: { action: "approve" | "paid" | "failed", reference?, reason? }
 *   approve → status processing (balance stays locked)
 *   paid    → status paid; clears the locked amount (record provider_transfer_id)
 *   failed  → status failed; returns the amount to the affiliate's pending balance
 *
 * Balance moves run inside fn_settle_payout (atomic). Every transition is
 * written to audit_events. Disbursement itself stays manual (VCH-ADMIN: no
 * automated transfer) — this only records what the admin did out-of-band.
 */
import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { writeAuditEvent } from "@vouchfx/db";

const ACTION_STATUS: Record<string, string> = {
  approve: "processing",
  paid: "paid",
  failed: "failed",
};

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const admin = await requireAdminRoute();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: { action?: string; reference?: string; reason?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const newStatus = ACTION_STATUS[body.action ?? ""];
  if (!newStatus) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  if (newStatus === "failed" && !body.reason?.trim()) {
    return NextResponse.json({ error: "A reason is required to mark a payout failed." }, { status: 422 });
  }

  const svc = createServiceClient();

  // Load for the audit trail (amount, owner) before mutating.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: payout } = await (svc as any)
    .from("payouts")
    .select("user_id, amount_usd, status, method")
    .eq("id", id)
    .maybeSingle();
  if (!payout) return NextResponse.json({ error: "Payout not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcErr } = await (svc as any).rpc("fn_settle_payout", {
    p_payout_id: id,
    p_new_status: newStatus,
    p_reference: body.reference?.trim() || null,
    p_processed_by: admin.email ?? admin.id,
    p_failure_reason: body.reason?.trim() || null,
  });

  if (rpcErr) {
    const already = rpcErr.message?.includes("already_settled");
    return NextResponse.json(
      { error: already ? "This payout has already been settled." : "Could not update payout." },
      { status: already ? 409 : 500 }
    );
  }

  await writeAuditEvent(svc, {
    userId: (payout as { user_id: string }).user_id,
    eventType: `payout_${body.action}`,
    payload: {
      payout_id: id,
      amount_usd: (payout as { amount_usd: number }).amount_usd,
      method: (payout as { method: string }).method,
      from_status: (payout as { status: string }).status,
      to_status: newStatus,
      reference: body.reference?.trim() || null,
      reason: body.reason?.trim() || null,
      processed_by: admin.email ?? admin.id,
    },
  });

  return NextResponse.json({ ok: true });
}
