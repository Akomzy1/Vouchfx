# VouchFX — Build Sequence v1.0 (for Claude Code)

**How to use:** Run prompts in order in Claude Code from the repo root. Each assumes the previous is merged and working. `CLAUDE.md` and the four `SKILL.md` files must be in the repo first (Prompt 0). Each prompt references PRD requirement IDs (e.g. `VCH-EXE-04`) and the relevant skill. Don't skip ahead — later prompts depend on earlier scaffolding.

**Phase gates:**
- **Phase 0 (spike)** proves the pipeline end-to-end for one hardcoded user. Exit: 50 consecutive correct executions across 5 live signal formats, end-to-end < 2s.
- **Phase 1 (MVP)** is the multi-tenant product = all **M**-priority PRD requirements. Exit: 30-day beta — missed ≤1/user/week, double-execution 0, NPS > 40.

---

## Prompt 0 — Repo + docs bootstrap
```
Initialise the VouchFX monorepo: pnpm workspaces + Turborepo, TypeScript strict everywhere. Create apps/web (Next.js App Router), apps/listener (Node worker), apps/executor (Node worker), and packages/core, packages/db, packages/config. Add the provided CLAUDE.md at root and the four SKILL.md files under .claude/skills/. Set up zod-based env validation in packages/config, shared tsconfig, eslint/prettier, and a Turbo pipeline. No business logic yet — just the scaffold, scripts, and a passing typecheck/lint.
```

---

# PHASE 0 — End-to-end spike (single user)

## Prompt P0.1 — Minimal schema + Supabase
```
In packages/db, set up the Supabase client and a MINIMAL schema with migrations: users, broker_connections, signal_sources, parsed_signals (with UNIQUE(source_id, telegram_message_id)), trades (with a uniqueness guard preventing two open/pending rows per parsed_signal_id), audit_events (append-only). Generate TypeScript types. Seed one test user. No RLS yet (spike only). Document the idempotency constraints in comments.
```

## Prompt P0.2 — Telegram listener (one session)
```
In apps/listener, using GramJS (npm `telegram`), connect ONE hardcoded user string-session and subscribe to new-message events for one hardcoded channel id. Log each message. Enforce READ-ONLY: no send/join/react/read operations anywhere (see telegram-ingestion skill). On each new message, build the idempotency id `${chat_id}:${message_id}:${edit_version}` and print it. No queue yet.
```

## Prompt P0.3 — Claude parser
```
In packages/core, build the parser using @anthropic-ai/sdk with claude-haiku-4-5-20251001 and tool-use structured output matching the schema in the signal-parsing skill (is_signal, symbol, side, order_type, entries, sl, tps, confidence, reasoning, follow_up_type, ...). Add prompt caching for the system prompt + symbol glossary. Validate output with zod. Add a CLI to parse a pasted signal string and print the structured result. No model escalation yet.
```

## Prompt P0.4 — MetaApi executor (one demo account)
```
In packages/core, define the Executor interface from the trade-execution skill and implement MetaApiExecutor using `metaapi.cloud-sdk`. In apps/executor, connect ONE hardcoded MT5 DEMO account, resolve the broker symbol, and place a market order from a parsed signal (single TP for now). Print the broker order id and fill price. Decrypt nothing yet (spike uses env vars), but never log secrets.
```

## Prompt P0.5 — Wire the pipeline with idempotency
```
Connect listener → BullMQ (Upstash Redis) → executor. Job id = the idempotency key. The executor: parses the message (P0.3), then places the trade (P0.4) ONLY after inserting the trades row with ON CONFLICT DO NOTHING (per trade-execution skill). Prove a duplicate/redelivered message never places a second trade. Write an audit_events row at each step (received, parsed, executed/skipped).
```

## Prompt P0.6 — Multi-TP + follow-up/cancel + tiny dashboard
```
Extend the executor to split volume across multiple TPs as separate legs with a shared SL. Handle follow-ups: MODIFY_SL, MOVE_TO_BE, CLOSE_ALL, CLOSE_PARTIAL, CANCEL_PENDING (delete unfilled order; close if filled) — matched to the originating signal. Add a single Next.js page in apps/web listing parsed_signals and trades with their audit trail. This completes Phase 0 — verify the exit criteria (50 consecutive correct executions across 5 formats, e2e < 2s).
```

---

# PHASE 1 — Multi-tenant MVP

### Foundation

## Prompt P1.1 — Full schema + Auth + RLS
```
Expand packages/db to the full PRD data model: add telegram_sessions, risk_settings, trade_events, subscriptions, referrals, affiliate_accounts, payouts; keep parsed_signals/trades idempotency constraints. Enable Supabase Auth (email + Google). Add Row-Level Security on EVERY table scoped to auth.uid(); audit_events append-only. Write migrations and regenerate types. Add tests proving RLS isolation between two users.
```

## Prompt P1.2 — Web app shell + design system
```
In apps/web, build the authenticated app shell: Supabase Auth flows (signup, login, Google, password reset, optional TOTP per VCH-AUTH-02), and the layout with a left sidebar (Dashboard, Channels, Signals, Risk, Billing, Refer & earn, Settings) collapsing to a bottom nav on mobile. Implement the VouchFX design tokens (dark #0B0F14, surfaces #151B23, teal #14B8A6 accent, monospace tabular numbers, green/red reserved for P&L/status). Build reusable components: StatCard, StatusPill, DataTable, Card. Reference the prototype context doc for the look.
```

### Telegram

## Prompt P1.3 — Telegram connect + encrypted sessions
```
Build the Telegram connect flow (VCH-TG-01): QR and phone+code (handle 2FA password). Store the GramJS string session AES-256-GCM encrypted via Supabase Vault/KMS, decrypt only in worker memory, never log (telegram-ingestion skill). Surface connection + SpamBot/limited status (VCH-TG-07).
```

## Prompt P1.4 — Listener supervisor (pool) + read-only guard
```
Refactor apps/listener into a supervised pool managing one GramJS client per connected user (user_id → client). Add heartbeat, reconnect-with-backoff, and a hard architectural guard that NO write/outbound operation can run on a user session (enforced + unit-tested). Emit signal jobs with the idempotency key (VCH-TG-02, NFR-03).
```

## Prompt P1.5 — Channel discovery, selection, per-channel settings
```
Implement channel discovery (auto-list dialogs, VCH-TG-03), enable/disable per channel (VCH-TG-04), per-channel risk + daily-signal-limit overrides (VCH-TG-05), and the kill switch with "pause & keep open" vs "pause & close all" (VCH-TG-06). Subscribe to message events only for enabled channels.
```

## Prompt P1.6 — Edit/delete → cancel handling
```
Handle Telegram message EDIT (incremented edit_version → enqueue for modify/cancel classification) and DELETE (synthetic CANCEL_PENDING job referencing the original signal). Persist message→signal mapping so a deletion resolves to the right trade (VCH-PRS-07c). The executor cancels the unfilled pending order, or applies the user's close policy if filled.
```

### Parsing

## Prompt P1.7 — Parser routing + caching + confidence
```
Productionise the parser (signal-parsing skill): model routing Haiku 4.5 → Sonnet 4.6 (confidence <0.85 / image / ambiguous follow-up) → Opus 4.8 (first N signals of a new channel / flagged) per VCH-PRS-03. Prompt caching, structured output, confidence gating (VCH-PRS-04), plain-English reasoning stored for the audit log (VCH-PRS-05). Handle ranges and pip/percent units (VCH-PRS-08).
```

## Prompt P1.8 — Vision parsing
```
Add image/screenshot signal parsing (VCH-PRS-02): download media in the listener, pass to claude-sonnet-4-6 vision with the same structured-output schema. Same confidence gating and audit reasoning.
```

## Prompt P1.9 — Follow-up & cancel classification
```
Implement full follow-up classification with prior-signal context (VCH-PRS-07, 07b): MODIFY_SL, MODIFY_TP, MOVE_TO_BE, CLOSE_PARTIAL, CLOSE_ALL, CANCEL_PENDING, NEW_SIGNAL, IGNORE — including free-text cancels ("scrap it", "no longer valid"). Set references_prior_trade so the executor matches the right trade.
```

### Broker & execution

## Prompt P1.10 — Broker connect (managed MetaApi)
```
Build the broker connect flow (VCH-BRK-01): user enters MT5 server/login/password; VouchFX provisions and validates the MetaApi account behind the scenes — the user NEVER sees MetaApi. Encrypt credentials (VCH-BRK-02), prefer investor/trade-only password with UI guidance. Show balance/equity on success. Multiple accounts per plan limit (VCH-BRK-04). Credential rotation/remove (VCH-BRK-06).
```

## Prompt P1.11 — Execution: orders, multi-TP, symbol mapping
```
Productionise MetaApiExecutor (trade-execution skill): market + pending (limit/stop) buy/sell (VCH-EXE-01), multi-TP volume split into legs with shared SL (VCH-EXE-02), broker symbol-suffix/gold auto-detection via resolveSymbol (VCH-BRK-03). Volume comes from the risk engine, never computed here.
```

## Prompt P1.12 — Cancel/close execution + trade matching
```
Implement cancel/close (VCH-EXE-06b, 06c): cancelPending deletes unfilled orders; closePosition (full/partial) closes filled ones; MOVE_TO_BE modifies SL. Match by channel + symbol + originating signal; ignore if no VouchFX-managed trade matches — never touch unrelated/manual trades. Resolve CANCEL_PENDING vs CLOSE via live order state.
```

## Prompt P1.13 — Idempotency hardening + disconnect/replay
```
Harden idempotency (VCH-EXE-04): job-id key + ON CONFLICT guard + MetaApi client-supplied request id; on worker restart reconcile ambiguous trades via getState before acting. Handle broker DISCONNECTED: pause execution, dashboard banner, auto-resume (VCH-BRK-05). Admin/user manual replay respecting idempotency (VCH-EXE-07).
```

### Risk

## Prompt P1.14 — Risk engine: sizing
```
Build the pure risk engine in packages/core (risk-engine skill): position sizing for % balance (default 0.5%), fixed lot, fixed $ risk (VCH-RSK-01), resolving pip/percent SL to price distance and rounding to broker volume step. Fully unit-tested.
```

## Prompt P1.15 — Daily limits + signal limit
```
Implement the gate order from the risk-engine skill: daily signal limit global + per-channel counting ACTED-ON signals with day-rollover (VCH-RSK-02b), max trades/day (VCH-RSK-02). Skip-with-reason on breach (VCH-EXE-06). Document signal-count vs trade-count semantics for multi-TP.
```

## Prompt P1.16 — Drawdown guardian + SL policy + trade mgmt
```
Add daily loss cap → pause + optional close-all (VCH-RSK-03), default-SL policy apply/skip/ask (VCH-RSK-04), breakeven-after-TP1 and trailing-after-TP2 (VCH-RSK-05), and news filter (VCH-RSK-06). All decisions written to audit_events.
```

### Dashboard & UX

## Prompt P1.17 — Dashboard
```
Build the dashboard (VCH-DSH-01): stat cards (balance, equity, today's P&L, open trades, "signals today X of Y"), open-positions table with Supabase Realtime updates, recent-activity feed, equity sparkline (recharts), broker/Telegram status banners. Use the canonical mock-data shapes from the prototype context for layout.
```

## Prompt P1.18 — Signal detail / audit log
```
Build the signal-detail/audit view (VCH-DSH-02, 03): raw message → parsed fields + confidence + model → plain-English reasoning → risk checks → broker action → live P&L and event timeline (incl. pending-order cancelled, closed-by-signal). This is the transparency differentiator — make every step inspectable.
```

## Prompt P1.19 — Channels + risk settings UI
```
Build the Channels management UI (list, toggles, status Live/Demo-first/Paused, per-channel daily signal limit, kill switch, overrides) and the global Risk settings UI (sizing, daily limits, drawdown guardian, default-SL policy, breakeven/trailing, news filter) with sensible defaults and helper text. Sticky Save.
```

## Prompt P1.20 — Notifications
```
Implement notifications (VCH-NOT-01): in-app + email via Resend for broker disconnect, daily-loss-cap hit, Telegram session limited, trade opened/closed (user-configurable). 
```

### Billing & referral

## Prompt P1.21 — Stripe billing + tax + gating
```
Integrate Stripe (VCH-BIL-01, 01b): Subscriptions for Starter/Pro/Funded, one-off Lifetime, Stripe Tax, webhooks (checkout, renewal, refund, cancel). Enforce plan gating (broker-account limits, prop-firm feature flags) per PRD §11 (VCH-BIL-03). Note billing entity assumption (PRD R10).
```

## Prompt P1.22 — Paystack (Nigeria)
```
Integrate Paystack for NGN buyers (VCH-BIL-02): same SKUs, naira at point of charge, webhooks for payment success/refund. Keep entitlements unified with Stripe-side state.
```

## Prompt P1.23 — Trial + limit enforcement
```
Enforce the 7-day free trial with a system-locked 1-signal/day cap (reuse the daily-signal-limit mechanism as a plan override, not a separate code path) and trial expiry → execution stops until a plan is purchased (VCH-AUTH-03, VCH-BIL-05).
```

## Prompt P1.24 — Referral & affiliate
```
Build Referral & affiliate (PRD §6.11, all M items): unique links/codes, last-touch attribution bound at signup (VCH-REF-03), 20% recurring commission accruing only on collected paid subscriptions with refund clawback (VCH-REF-01, 04), affiliate dashboard (VCH-REF-02), payouts with $50 threshold and method selection (VCH-REF-05), fraud controls — self-referral blocked, duplicate detection (VCH-REF-08). Add user referral (20% off first month for referee, 20% recurring account credit for referrer) as VCH-REF-06. Build the "Refer & earn" screen with both tabs.
```

### Onboarding & ops

## Prompt P1.25 — Onboarding wizard
```
Stitch the 5-step onboarding wizard (VCH-ONB-01): Connect Telegram (+ optional referral code field) → Choose channels → Connect broker → Set risk (incl. daily signal limit) → Go live (with demo-first option and the required risk-disclaimer checkbox, VCH-ONB-02). Resumable, ≤90s active time.
```

## Prompt P1.26 — Demo-first mode
```
Implement demo-first mode (VCH-DSH-05): a newly added channel runs on a paper/demo account for N days before going live; user can promote to live. Reuse the executor against a demo account; clearly label simulated trades.
```

## Prompt P1.27 — Admin/ops + monitoring
```
Build the ops health view (VCH-ADM-01): per-user TG session, broker status, last signal/trade age, error rate. Worker supervision with heartbeat + auto-restart within 60s (VCH-ADM-02). Wire Sentry + BetterStack; structured audit/event logging with NO secrets (VCH-ADM-03). Manual account undeploy/redeploy for cost control (VCH-ADM-04).
```

## Prompt P1.28 — Security & disclaimer pass
```
Final MVP hardening: verify no Telegram-session write paths exist; verify credentials/sessions are encrypted and never logged; confirm RLS coverage on all tables; mask broker passwords in UI; add the execution-tool/no-advice disclaimer at signup, in onboarding, and in the footer. Run the test suite (risk engine, idempotency guard, parser schema, cancel/close matching, RLS isolation). Confirm Phase 1 exit criteria.
```

---

## Notes
- **Demo-first (P1.26) and news filter (in P1.16)** are PRD **S**-priority — include in MVP if time allows, otherwise defer to immediately post-launch without breaking the sequence.
- Resolve PRD §14 open questions before the prompts they touch: **R5** (default-SL default) before P1.16; **R10** (billing entity) before P1.21; **R9** (commission structure) before P1.24; **R8** (model pins) is already set in CLAUDE.md.
- After Phase 1: Phase 2 adds multi-platform (cTrader Open API, DXTrade, TradeLocker, Deriv — new Executor implementations behind the existing interface) and the **Prop Mode rule engine (PRD §6.12)**: the versioned firm rule library, per-account rule profiles, the real-time equity guardian, the consistency manager, firm-tuned news/weekend handling, stealth execution, and pre-trade rule simulation. Multi-platform is a prerequisite for Prop Mode, since prop firms run heavily on cTrader/DXTrade/TradeLocker, not just MT5. Phase 3 adds the self-hosted MT5-on-Wine execution backend behind the same Executor interface.
```
