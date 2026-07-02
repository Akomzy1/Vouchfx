import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Telegram listener (MTProto)
  TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
  TELEGRAM_API_HASH: z.string().optional(),
  // Session string — generated once via apps/listener/src/auth.ts; stored encrypted at rest
  TELEGRAM_SESSION_STRING: z.string().optional(),
  // Phase-0 spike: the single channel chat id to listen to (e.g. "-1001234567890")
  TELEGRAM_SPIKE_CHAT_ID: z.string().optional(),

  // Anthropic — signal parser
  ANTHROPIC_API_KEY: z.string().optional(),

  // JBlanked News API — economic calendar primary feed (VCH-RSK-06b).
  // FREE TIER: 1 request/day — the fetcher enforces this via calendar_fetch_log.
  JBLANKED_API_KEY: z.string().optional(),

  // MetaApi — broker execution
  METAAPI_TOKEN: z.string().optional(),
  // Phase-0 spike: the MetaApi account id for the one hardcoded demo account
  SPIKE_METAAPI_ACCOUNT_ID: z.string().optional(),

  // Redis — BullMQ queue (ioredis-compatible URL)
  // Local dev: redis://localhost:6379
  // Upstash:   rediss://:<token>@<host>:6380
  REDIS_URL: z.string().default("redis://localhost:6379"),
  // Legacy REST API keys (kept for reference, not used by BullMQ)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Encryption key for Telegram session strings at rest (32-byte base64)
  ENCRYPTION_KEY: z.string().optional(),

  // Resend — transactional email
  RESEND_API_KEY: z.string().optional(),

  // Web Push (VAPID) — PWA push notifications. Generate once with the helper in
  // @vouchfx/core/push (generateVapidKeys). Push is skipped when these are absent.
  VAPID_PUBLIC_KEY: z.string().optional(),   // also exposed to the browser via NEXT_PUBLIC_VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),      // "mailto:alerts@vouchfx.com" or the site URL

  // Stripe — global billing (PRD R10: must bill via non-Nigerian entity — UK Ltd or US LLC)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Price IDs — create in Stripe dashboard (test mode) and copy here
  STRIPE_PRICE_STARTER_ID:  z.string().optional(),
  STRIPE_PRICE_PRO_ID:      z.string().optional(),
  STRIPE_PRICE_FUNDED_ID:   z.string().optional(),
  STRIPE_PRICE_LIFETIME_ID: z.string().optional(),

  // Paystack — Nigeria billing (NGN)
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  // Plan codes from Paystack dashboard (create recurring plans, copy the plan_code)
  PAYSTACK_PLAN_STARTER_CODE:  z.string().optional(),
  PAYSTACK_PLAN_PRO_CODE:      z.string().optional(),
  PAYSTACK_PLAN_FUNDED_CODE:   z.string().optional(),
  // Lifetime one-off amount in kobo (1 NGN = 100 kobo); e.g. 59900000 = ₦599,000
  PAYSTACK_LIFETIME_AMOUNT_KOBO: z.coerce.number().int().positive().optional(),

  // Monitoring
  // Sentry DSN — optional; if absent, error tracking is disabled.
  SENTRY_DSN: z.string().url().optional(),
  // Comma-separated admin email addresses (e.g. "alice@example.com,bob@example.com")
  ADMIN_EMAILS: z.string().optional(),

  // Referral & affiliate program master switch (PRD §6.11). DEFERRED at launch —
  // default OFF. When false: the "Refer & earn" UI is hidden, the /r/ and /ref/
  // links are inert (no attribution cookie, no bind), and commission/credit
  // accrual is a no-op. Existing accrued balances, payouts, ledger rows, and
  // captured attribution are preserved untouched — flip to true to re-enable.
  // The web app reads NEXT_PUBLIC_REFERRAL_AFFILIATE_ENABLED (client-visible);
  // keep both in sync. This server copy is for non-web workers.
  // NB: only the exact string "true"/"1" enables it — anything else is off.
  REFERRAL_AFFILIATE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings from .env files as absent so optional validators don't fail.
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v])
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  return result.data;
}

// Singleton — validated once at startup.
// Workers and server actions import this directly; never log or serialise it.
export const env = parseEnv();
