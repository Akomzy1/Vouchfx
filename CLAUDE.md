# CLAUDE.md — VouchFX

> Project memory for Claude Code. Read this fully before writing any code. The PRD (`VouchFX_PRD_v1.0.md`) is the source of truth for *what* to build; this file governs *how*. When they conflict, ask.

## 1. What VouchFX is

VouchFX automatically copies trading signals from a user's Telegram channels onto their MetaTrader 5 (MT5) account. Flow: read signal from Telegram → parse with Claude → validate against the user's risk rules → place/modify/cancel/close the trade on the broker → log every step transparently. It is an **execution tool the user controls** — never financial advice, never a managed account, never a signal marketplace.

## 2. The non-negotiable invariants

These are correctness- and safety-critical. Violating any is a release blocker.

1. **Never double-place a trade.** Every execution is idempotent. A trade may be opened for a signal only if no `trades` row already exists for that `parsed_signal_id` in an OPEN/PENDING state. Use the unique key and `INSERT ... ON CONFLICT DO NOTHING`. See the trade-execution skill.
2. **Idempotency key = `(telegram_chat_id, telegram_message_id, edit_version)`.** This identifies a signal uniquely across retries, worker restarts, and duplicate deliveries.
3. **Telegram user sessions are strictly READ-ONLY.** Never send messages, react, join, leave, mark-read, or perform any write/outbound MTProto operation on a user session. This is the single biggest factor in not getting users' Telegram accounts banned. There must be zero code paths that write via a user session.
4. **Credentials and Telegram session strings are encrypted at rest** (AES-256-GCM, key wrapped by Supabase Vault or KMS), decrypted only in worker memory just-in-time, and **never logged, never put in queues, never sent to Sentry breadcrumbs**.
5. **Never execute below the confidence threshold**, and never execute a signal with no stop loss unless the user's default-SL policy explicitly says "apply default SL". Otherwise skip-with-reason.
6. **All risk caps are enforced server-side before execution**: per-trade risk %, daily signal limit (global + per-channel), max trades/day, daily loss cap. A trade that would breach a cap is skipped-with-reason, never silently placed.
7. **Cancel semantics are exact**: `CANCEL_PENDING` deletes an *unfilled pending order*; `CLOSE_ALL`/`CLOSE_PARTIAL` close a *filled position*. A Telegram message delete/edit on a signal whose order has not filled is treated as a cancel. Never confuse the two.
8. **Row-Level Security on every table**, scoped to `auth.uid()`. No service-role queries from user-facing code paths.
9. **No financial-advice language** anywhere in UI, copy, or model output. No "expected profit", "guaranteed", "recommended signal".
10. **Money is displayed in monospace tabular figures**; green/red are reserved strictly for P&L and connection status (see design tokens).

## 3. Architecture

```
apps/
  web/        Next.js (App Router) — marketing, dashboard, settings, API routes,
              Stripe + Paystack webhooks. Deploys to Vercel.
  listener/   Long-lived Node worker. Manages a POOL of per-user GramJS MTProto
              clients (read-only). Emits signal jobs to the queue. Deploys to Fly.io.
  executor/   Long-lived Node worker. Consumes the queue: parses (Claude),
              validates (risk engine), executes (MetaApi). Deploys to Fly.io.
packages/
  core/       Domain logic shared by workers + web: Executor interface, risk engine,
              parser client, signal types, idempotency helpers. No I/O side effects.
  db/         Supabase client, generated types, SQL migrations, RLS policies.
  config/     Env loading/validation (zod), constants, model IDs.
```

- **Monorepo:** pnpm workspaces + Turborepo. **Language: TypeScript everywhere.**
- **Why one process pool, not one machine per user (for MVP):** at beta scale (≤~50 users) the listener runs a single supervised process holding many MTProto clients. Scale to machine-per-user via the Fly Machines API only when justified (Phase 3). Do not prematurely build per-user infra.
- **Vercel serverless cannot host the listener or executor** (no long-lived connections, no sticky state). Those are always-on Fly.io Node processes. Vercel hosts only the Next.js web app and its short-lived API routes/webhooks.

## 4. Stack & key libraries

| Concern | Choice | Library / notes |
|---|---|---|
| Web | Next.js (App Router) | TypeScript, server components where sensible |
| DB / Auth / Realtime / secrets | Supabase | Postgres + Auth + RLS + Realtime + Vault |
| Telegram (read) | GramJS | npm `telegram`; MTProto user client; read-only |
| Signal parsing | Claude API | `@anthropic-ai/sdk`; model routing + prompt caching + tool-use structured output |
| MT5 execution | MetaApi | npm `metaapi.cloud-sdk`; managed — user never sees MetaApi |
| Queue | BullMQ | on Upstash Redis; job id = idempotency key |
| Payments (global) | Stripe | `stripe`; Subscriptions + one-off Lifetime; Stripe Tax. Requires a non-Nigerian billing entity (see PRD R10). |
| Payments (Nigeria) | Paystack | REST/webhooks; NGN |
| Email | Resend | `resend`; transactional alerts |
| Monitoring | Sentry + BetterStack | plus the Postgres audit log |

## 5. Claude model routing (parser)

Use these API model IDs and escalate only as needed (cost discipline matters — see PRD §5):

- **Default (text, well-formed):** `claude-haiku-4-5-20251001`
- **Fallback / vision / multilingual:** `claude-sonnet-4-6` — used when Haiku confidence `< 0.85` OR an image is attached OR follow-up classification is ambiguous.
- **Hard cases / new-channel learning:** `claude-opus-4-8` — first N signals of a newly added channel, and human-flagged ambiguous cases only (≤5% of volume).
- **Mandatory:** cache the system prompt + symbol glossary + broker-symbol map via prompt caching. Use tool-use / JSON-schema mode for structured output. See the signal-parsing skill.

## 6. Data model

Tables (full DDL/migrations live in `packages/db`): `users`, `telegram_sessions`, `broker_connections`, `signal_sources`, `risk_settings`, `parsed_signals`, `trades`, `trade_events`, `audit_events`, `subscriptions`, `referrals`, `affiliate_accounts`, `payouts`.

Hard rules:
- `UNIQUE (source_id, telegram_message_id)` on `parsed_signals` — idempotency foundation.
- `trades` open guarded by `ON CONFLICT DO NOTHING` against an open/pending uniqueness constraint per `parsed_signal_id`.
- RLS on all tables scoped to `auth.uid()`.
- `audit_events` is append-only; never updated or deleted.

## 7. Skills (read the relevant one before working on that subsystem)

Located at `.claude/skills/<name>/SKILL.md`:
- `signal-parsing` — the Claude parsing layer: prompts, schema, confidence, vision, follow-up/cancel classification.
- `trade-execution` — MetaApi, the Executor interface, idempotency, multi-TP, cancel/close, reconnection.
- `telegram-ingestion` — GramJS, read-only enforcement, session security, edit/delete events.
- `risk-engine` — sizing, daily signal limit, max trades/day, drawdown guardian, default-SL policy.

## 8. Conventions

- Validate all external input and env with **zod**. No untyped `any` at boundaries.
- Pure domain logic in `packages/core` — no direct DB/network calls; inject dependencies.
- Every executed/skipped/modified/cancelled signal writes an `audit_events` row with enough context to reconstruct what happened and why (the user-facing transparency feature depends on this).
- Errors are explicit and logged with correlation IDs; never swallow.
- Secrets only via `packages/config` env validation; never inline.
- Tests: unit-test the risk engine, idempotency guard, parser schema validation, and cancel/close matching — these are where correctness bugs cost money.

## 9. What NOT to do

- Do not add any write operation to a Telegram user session.
- Do not place a trade outside the idempotent execution path.
- Do not ask the user to set up MetaApi themselves — it is fully managed and invisible.
- Do not log or expose credentials, session strings, or full broker passwords (mask in UI).
- Do not introduce signal scoring, leaderboards, provider broadcasting, or managed-account features — explicitly out of scope (PRD §15).
- Do not use localStorage/sessionStorage in any artifact/prototype context.
- Do not weaken RLS or run user-facing queries with the service role.

## 10. Build order

Follow `VouchFX_Build_Sequence_v1.0.md`: Phase 0 (single-user end-to-end spike) must hit its exit criteria before Phase 1 (multi-tenant MVP). Do not jump ahead; each prompt assumes the previous one is merged and working.
