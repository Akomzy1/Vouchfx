/**
 * DELETE /api/account — self-serve account deletion (NFR-06).
 *
 * Money-safety: blocked while the user is owed affiliate cash (checkAccountDeletion).
 * Otherwise deletes the auth user, which cascades the user's own rows
 * (affiliate_accounts, broker_connections, telegram_sessions, subscriptions…)
 * while migration 033 DETACHES and RETAINS the financial trail: referral rows,
 * commission_ledger entries, and payout history survive with the personal link
 * set to NULL. The counterparty's earned money is untouched.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkAccountDeletion } from "@/lib/account";

export const runtime = "nodejs";

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  // Money-safety gate — never destroy owed cash.
  const check = await checkAccountDeletion(svc, user.id);
  if (check.blocked) {
    return NextResponse.json({ error: check.reason, code: "owed_balance", owed_usd: check.owedUsd }, { status: 409 });
  }

  // Deletes auth.users → cascades the user's own data; FKs (migration 033)
  // detach-and-retain the financial/audit trail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any).auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: "Could not delete account. Please contact support." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
