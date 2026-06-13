/**
 * Admin authorisation (VCH-ADMIN-01).
 *
 * Access requires EITHER:
 *   - the 'admin' role in user_roles (first-class permission, via is_admin RPC), OR
 *   - membership in ADMIN_EMAILS (bootstrap/break-glass — needed to grant the
 *     very first admin role, and as a fallback if the DB role check fails).
 *
 * Use requireAdminPage() in server components (redirects) and
 * requireAdminRoute() in route handlers (returns null → caller responds 403).
 */
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function inAdminEmails(email: string | undefined | null): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

async function resolveAdmin(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (inAdminEmails(user.email)) return user;

  // is_admin() is SECURITY DEFINER and scoped to auth.uid() server-side.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: isAdmin } = await (supabase as any).rpc("is_admin");
  return isAdmin === true ? user : null;
}

/** Server-component guard. Redirects non-admins; returns the admin user. */
export async function requireAdminPage(): Promise<User> {
  const user = await resolveAdmin();
  if (!user) redirect("/dashboard");
  return user;
}

/** Route-handler guard. Returns the admin user, or null (caller sends 403). */
export async function requireAdminRoute(): Promise<User | null> {
  return resolveAdmin();
}

/**
 * "Any staff" guard for the shared admin shell — admins OR rule_approvers.
 * The /admin layout uses this so rule-approvers keep access to the prop
 * approval pages; the admin-only console sections enforce requireAdminPage()
 * themselves. Redirects non-staff.
 */
export async function requireStaffPage(): Promise<User> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (inAdminEmails(user.email)) return user;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: isAdmin }, { data: isApprover }] = await Promise.all([
    sb.rpc("is_admin"),
    sb.rpc("is_rule_approver"),
  ]);
  if (isAdmin === true || isApprover === true) return user;
  redirect("/dashboard");
}
