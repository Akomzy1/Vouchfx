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

## Prompt P1.2b — Production marketing landing page
```
In apps/web, build the public marketing landing page as a server-rendered, SEO-optimised route (static/ISR, fast, indexable — competitors rank for "telegram signal copier"). Translate the validated claude.ai landing prototype into the real app using the VouchFX design language. Sections: sticky nav (wordmark; Features, How it works, Pricing, a subtle Telegram icon+label link, Login; teal "Start free trial"); audience-neutral hero ("Your Telegram signals, traded automatically on MT5" / "Any signal, any format, executed under your own risk rules. Whether you trade a live account or a funded one, VouchFX keeps every trade inside your limits.") with the signal→trade visual and the free-trial CTA as the single primary action; trust strip; how-it-works (3 steps); feature grid (AI parsing, fully-managed execution, transparent audit log, risk controls, funded-trader-friendly as ONE card, naira & card checkout); pricing (Starter $19 / Pro $39 "most popular" / Funded $79 / Lifetime $399, USD or naira); a rule-monitor band between features and pricing (headline "Prop firm changed the rules? We already know.", body on the AI agent monitoring firm terms with changes detected, human-verified, and live in guardrails, plus the "last verified" stamp, with a mock "FundingPips · Daily loss: 5% → 4% · Verified today" card and caption "Available on the Funded plan"); an affiliate band ("Run a signal channel? Earn 20% recurring"); a community strip ("Join the VouchFX community on Telegram"); and a footer.
Telegram channel link is https://t.me/getvouchfx — used in the nav, the community strip, and the footer ("Join our Telegram", paper-plane icon), opening in a new tab. NOT in the hero. Footer includes the disclaimer: "VouchFX is an execution tool you control. It does not provide financial advice or guarantee outcomes. Trading involves risk." Keep the page audience-neutral (live-account traders are primary; prop is a supported use case, not the identity) and fully responsive.
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
Add daily loss cap → pause + optional close-all (VCH-RSK-03), default-SL policy apply/skip/ask (VCH-RSK-04), breakeven-after-TP1 and trailing-after-TP2 (VCH-RSK-05), and news filter (VCH-RSK-06) backed by the calendar pipeline (VCH-RSK-06b/06c): a scheduled worker fetches the JBlanked News API (free tier — strictly ONE request/day) and normalises events into a Postgres calendar_events cache (event, currency, UTC timestamp converted at ingest, impact enum); the filter reads only the cache. Fallback: Forex Factory weekly JSON (nfs.faireconomy.media, ≤2 fetches/5min, detect the "Request Denied" HTML response) when the cache is stale >48h; on dual failure, prop accounts fail safe (block typical high-impact windows) and ops is alerted. Unit-test timezone conversion around DST boundaries. All decisions written to audit_events.
```

## Prompt P1.16b — Execution Mode (mirror vs apply-my-rules)
```
Implement Execution Mode in the risk engine and settings (VCH-RSK-09..12, see risk-engine skill). Global + per-channel setting: "Mirror provider exactly" vs "Apply my risk rules" (default Apply). In Mirror mode: place the provider's SL/TP prices unchanged; do NOT substitute a default SL or apply breakeven/trailing unless explicitly opted in; size volume via the mirror lot sub-choice (provider's stated lot → else fixed → else risk-based, VCH-RSK-10); a no-SL signal executes ONLY if the user's "allow no stop loss" acknowledgement is on, else skip-with-reason (VCH-RSK-11). CRITICAL: hard caps (daily signal limit, max trades/day, daily loss cap) remain enforced in BOTH modes (VCH-RSK-12). Surface the toggle, lot sub-choice, and no-SL acknowledgement in onboarding Step 4 and the Risk settings screen. Unit-test that Mirror mode preserves provider levels yet still respects caps.
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
Build the Channels management UI (list, toggles, status Live/Paused, per-channel daily signal limit, kill switch, overrides) and the global Risk settings UI (Execution Mode mirror/apply with mirror lot sub-choice + no-SL acknowledgement, sizing, daily limits, drawdown guardian, default-SL policy, breakeven/trailing, news filter) with sensible defaults and helper text. Sticky Save.
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
Stitch the 5-step onboarding wizard (VCH-ONB-01): Connect Telegram (+ optional referral code field) → Choose channels → Connect broker → Set risk (incl. Execution Mode mirror/apply with mirror lot sub-choice + no-SL acknowledgement, and daily signal limit) → Go live (summary + the required risk-disclaimer checkbox, VCH-ONB-02; the broker-connect step notes a demo account can be connected for testing). Resumable, ≤90s active time.
```

## Prompt P1.26 — REMOVED (demo-first mode)
```
Demo-first mode was removed by product decision (PRD R6). VouchFX treats demo and live MT5 accounts identically; users test by connecting their broker's demo account. If demo-first code exists from an earlier build, remove it: drop demo_until/demo-first channel states, demo-account routing, and "Demo-first" status pills; add a short note to the broker-connect UI ("Want to test first? Connect your broker's free demo account — VouchFX works identically on demo and live"). Show account type (demo/live) as a badge on the broker connection, derived from MetaApi account info, so users always know which they're trading on.
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
- **News filter (in P1.16)** is PRD **S**-priority — include in MVP if time allows, otherwise defer to immediately post-launch. Demo-first was removed by decision (see P1.26).
- Resolve PRD §14 open questions before the prompts they touch: **R5** (default-SL default) before P1.16; **R10** (billing entity) before P1.21; **R9** (commission structure) before P1.24; **R8** (model pins) is already set in CLAUDE.md.
- After Phase 1: **Phase 2 (MT5-only)** adds the **Prop Mode rule engine (PRD §6.12)**: the versioned firm rule library, per-account rule profiles, the real-time equity guardian, the consistency manager, firm-tuned news/weekend handling, stealth execution, and pre-trade rule simulation — plus Stripe + Stripe Tax, the Lifetime SKU, the referral/affiliate program, and vision/parsing hardening. On MT5 this reaches MT5-based prop firms only. **Phase 3** adds multi-platform (cTrader Open API, DXTrade, TradeLocker, Deriv — new Executor implementations behind the existing interface), which extends Prop Mode to non-MT5 firms, plus the self-hosted MT5-on-Wine execution backend. The Prop Mode rule engine is platform-agnostic logic, so building it on MT5 now is not wasted — it lights up for more firms once multi-platform lands.

---

# PHASE 2 — Prop Mode (MT5-only) + Rule Monitor

Prereqs: Phase 1 exit criteria met. Decisions baked in: approver is a **fillable role** (permission, not a person); rule library includes **only firms that explicitly permit copy trading/EAs** (e.g. FundingPips, The5ers, FXIFY, BrightFunded — verify each when seeding). Still open before P2.14: Prop-tier-vs-Funded pricing (PRD R11).

### Rule library & engine

## Prompt P2.1 — Rule schema + library tables
```
In packages/db, add the Prop Mode schema: prop_firms, prop_rulesets (versioned, per firm+challenge: daily_loss {pct, basis equity|balance}, max_drawdown {pct, model static|eod_trailing|intraday_trailing}, consistency_pct, news_window {before_min, after_min}, weekend_holding_allowed, min_trading_days, copy_trading_permitted, source_url, verified_at, published_by, version), prop_account_profiles (broker_connection_id → active firm+challenge ruleset), and an append-only prop_rule_audit. RLS: rulesets are global-read; profiles are user-scoped; publishing requires the approver role (VCH-PROP-01, 02, 14). Add a rule_approver permission as a first-class role.
```

## Prompt P2.2 — Seed copy-friendly firm presets
```
Seed the library with an initial set of copy-trading-permitted firms (verify each firm's current published rules at seeding time and record source_url + verified_at): e.g. FundingPips, The5ers, FXIFY, BrightFunded — 1–2 challenge types each. Every seeded preset must have copy_trading_permitted = true (launch criterion, VCH-PROP-01). Build a small internal page listing seeded presets with their last-verified dates.
```

## Prompt P2.3 — Prop rule engine in the gate
```
Extend the risk engine (packages/core, pure logic): when a broker account has an active prop profile, evaluate every signal against the loaded ruleset BEFORE execution and write pass/fail per rule to audit_events (VCH-PROP-10). Per-account profiles run independently — a user with accounts on two firms enforces each correctly (VCH-PROP-02). Unit-test rule evaluation per field.
```

## Prompt P2.4 — Real-time equity guardian
```
Implement the equity guardian (VCH-PROP-03): stream equity from MetaApi for prop accounts and track it against the firm's equity-based intraday daily-loss floor and drawdown floor. Pre-block signals that would risk a breach; auto-flatten before the floor is touched (configurable buffer). All triggers logged with reason. This is latency-sensitive — keep it in the executor worker, co-located with the MetaApi region.
```

## Prompt P2.5 — Drawdown tracker (model-aware)
```
Implement the drawdown tracker (VCH-PROP-04) supporting static, EOD-trailing, and intraday-trailing models: compute and persist the current floor per the firm's model, refuse trades that would breach it (skip-with-reason), and expose the live floor to the dashboard. Unit-test each model against worked examples.
```

## Prompt P2.6 — Consistency manager
```
Implement the consistency manager (VCH-PROP-05): track per-day realised profit across the evaluation/funded period; as the best day approaches the firm's consistency cap (e.g. 28% vs 30%), throttle then pause copying for the day with reason; expose a profit-distribution series for the UI consistency meter.
```

## Prompt P2.7 — Firm-tuned news, weekend, min-days
```
Wire the firm's exact news window into the news filter (skip/auto-flatten inside the window, VCH-PROP-06), reading events from the cached calendar_events pipeline (VCH-RSK-06b/06c — JBlanked daily pull, FF fallback, fail-safe blocking on prop accounts when stale); auto-close positions before Friday close for firms banning weekend holding, and track min-trading-days progress (VCH-PROP-07). All actions logged.
```

## Prompt P2.8 — Stealth execution
```
Implement stealth (VCH-PROP-08): randomised lot variation within the user's risk budget, micro-delays, slight SL/TP jitter, neutral order comments — configurable, on by default for prop accounts. Verify two accounts copying the same signal place non-identical orders. Document honestly in the UI that stealth reduces, not eliminates, copy-group detection risk.
```

## Prompt P2.9 — Prop Mode UI
```
Build the Prop Mode screen (per the prototype Prompt 9): account selector with firm preset + "rules last verified" date, live rule cards (usage vs limit with status pills), the equity-guardian gauge, the consistency meter, stealth settings strip, and the copy-permission warning banner (VCH-PROP-09). Realtime updates via Supabase Realtime.
```

### Rule Monitor agent

## Prompt P2.10 — Monitor agent (fetch → extract → diff)
```
Build the Rule Monitor agent as a scheduled job (apps/executor or a small apps/agent worker): for each supported firm, fetch the rules source, extract the structured ruleset with Claude (structured output against the prop_rulesets schema), diff against the stored version, and record proposals with source_url, detected_at, and a confidence score (VCH-PROP-11). No publishing in this prompt — proposals only.
```

## Prompt P2.11 — Confidence-tiered publishing + approval queue
```
Implement publishing rules (VCH-PROP-12): account-killing fields (daily_loss, max_drawdown, consistency_pct) ALWAYS require approval; low-stakes high-confidence changes may auto-publish (logged, reversible); low-confidence → flagged for manual entry. Build the approval queue UI per prototype Prompt 10: diff old→new, stakes tag, source link, confidence pill, Approve/Reject/Edit — gated to the rule_approver role (VCH-PROP-13). Approvals/rejections write to prop_rule_audit.
```

## Prompt P2.12 — Versioning, rollback, notifications
```
Complete version-stamping (VCH-PROP-14) and rollback (VCH-PROP-15): version history per firm with published-by/source/date, one-click rollback (logged), and the user-facing "rules last verified" surfacing the latest verification. Notify the approver (email/in-app) when new proposals land, and notify affected users when a rule change on THEIR firm is published.
```

### Wrap-up

## Prompt P2.13 — Plan gating + pricing hook
```
Gate Prop Mode to the Funded tier (current PRD §11), with the entitlement check structured so a dedicated premium Prop tier can be introduced without code restructuring (PRD R11 still open on pricing). Update the billing UI to show Prop Mode availability per plan.
```

## Prompt P2.14 — Phase 2 hardening
```
Hardening pass: unit tests for each drawdown model, consistency throttling, equity-guardian trigger, and approval-role enforcement (non-approvers cannot publish); verify rule changes propagate to live enforcement only via published versions; confirm every prop decision is reconstructable from audit_events + prop_rule_audit. Run the full suite and confirm Phase 2 exit: Prop Mode live on seeded copy-friendly firms with the Rule Monitor running on schedule.
```
```
