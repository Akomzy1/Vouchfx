/**
 * Shared capture for /r/CODE (affiliate) and /ref/CODE (referral).
 *
 * Writes the ONE attribution cookie `vouchfx_ref` = "<source>:<CODE>" with a
 * 60-day window (VCH-REF-03), bumps the affiliate's click counter, and
 * redirects to the landing page. Last-touch wins (the cookie is overwritten on
 * each visit); the bind at signup locks whichever source is current then.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { REFERRAL_AFFILIATE_ENABLED } from "@/lib/flags";

export type ReferralSource = "affiliate" | "referral";
const COOKIE = "vouchfx_ref";
const SIXTY_DAYS = 60 * 60 * 24 * 60;
const CODE_RE = /^[A-Za-z0-9]{4,16}$/;

export async function captureReferral(request: Request, rawCode: string, source: ReferralSource) {
  const origin = new URL(request.url).origin;
  const code = (rawCode ?? "").trim().toUpperCase();

  // Program deferred at launch — the /r/ and /ref/ links are inert: set no
  // attribution cookie, count no click, just send the visitor to the landing page.
  if (!REFERRAL_AFFILIATE_ENABLED) {
    return NextResponse.redirect(`${origin}/`);
  }

  // Invalid code → just send them to the site, set nothing.
  if (!CODE_RE.test(code)) {
    return NextResponse.redirect(`${origin}/`);
  }

  const res = NextResponse.redirect(`${origin}/?ref=1`);
  res.cookies.set(COOKIE, `${source}:${code}`, {
    httpOnly: true,
    path: "/",
    maxAge: SIXTY_DAYS,
    sameSite: "lax",
  });

  // Best-effort click count (VCH-REF-02). Never blocks the redirect.
  try {
    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (svc as any).rpc("increment_affiliate_clicks", { p_code: code });
  } catch {
    /* ignore */
  }

  return res;
}
