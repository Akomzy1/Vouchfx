/**
 * Web feature flags.
 *
 * REFERRAL_AFFILIATE_ENABLED — master switch for the referral & affiliate
 * program (PRD §6.11). DEFERRED at launch — default OFF. When false, every
 * referral/affiliate surface is hidden or inert:
 *   - the "Refer & earn" nav item (Sidebar + BottomNav) is removed;
 *   - the /refer and /referrals pages redirect to /dashboard;
 *   - the /api/referral and /api/affiliate/payout routes return 404;
 *   - the /r/CODE and /ref/CODE links (and the legacy ?ref= middleware capture)
 *     set no attribution cookie and just redirect to the landing page;
 *   - attribution binding at signup/onboarding is a no-op;
 *   - commission/credit accrual is a no-op;
 *   - the onboarding referral-code field is hidden;
 *   - the landing-page affiliate/referral marketing band is removed (statically).
 *
 * No existing data is touched: accrued balances, payouts, ledger rows, and any
 * captured attribution are preserved. Set the flag to true to cleanly re-enable
 * every surface above (the landing band is code-removed and returns with its
 * commit; everything else is runtime-gated by this flag).
 *
 * Uses NEXT_PUBLIC_ so the identical value is available in client components
 * (nav, onboarding) and server code (routes, API handlers, pages, middleware);
 * Next.js inlines NEXT_PUBLIC_* at build time. Mirror it with the server-side
 * REFERRAL_AFFILIATE_ENABLED in packages/config for non-web workers.
 */
export const REFERRAL_AFFILIATE_ENABLED =
  process.env.NEXT_PUBLIC_REFERRAL_AFFILIATE_ENABLED === "true";
