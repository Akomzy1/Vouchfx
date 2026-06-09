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

  // Stripe — global billing
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Paystack — Nigeria billing
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(raw);
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
