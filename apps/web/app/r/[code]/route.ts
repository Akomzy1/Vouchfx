/**
 * GET /r/CODE — affiliate (cash) referral link (VCH-REF-01).
 * Captures the code into the single attribution cookie tagged source=affiliate,
 * 60-day window, then sends the visitor to the landing page.
 */
import { captureReferral } from "@/lib/referral-capture";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return captureReferral(request, code, "affiliate");
}
