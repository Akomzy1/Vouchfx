import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/admin";
import UserLookup from "@/components/admin/UserLookup";

export const metadata: Metadata = { title: "Admin — Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdminPage(); // admin-only section
  return <UserLookup />;
}
