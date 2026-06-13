# VouchFX — Product Requirements Document

**Version:** 1.0 (Draft)
**Status:** For client review
**Product:** VouchFX — Telegram-to-MT5 signal auto-copier
**Owner:** AkomzyAi Consulting Ltd (build) / Client (product owner)
**Scope:** Core execution product. Marketplace, signal-scoring, and provider-side features are explicitly **out of scope** for v1.0 (see §15).

---

## 1. Document control

| Field | Value |
|---|---|
| Version | 1.0 (Draft) |
| Supersedes | — (first PRD; follows the VouchFX strategy & technical blueprint) |
| Companion docs | VouchFX — Product, Market, Competitive & Technical Blueprint |
| Pricing currency | USD only |
| Primary platform (v1.0) | MetaTrader 5 (MT5) |
| Architecture intent | Platform-agnostic execution abstraction; cTrader / Deriv / DXTrade / TradeLocker are post-MVP but designed for from day one |
| Build approach | Documentation-first → CLAUDE.md/SKILL.md → Claude Code build-prompt sequence |

---

## 2. Product overview

### 2.1 One-line definition
VouchFX lets a trader automatically copy trading signals posted in the Telegram channels they already belong to, directly onto their own MT5 account, parsed by an LLM and executed under risk rules the trader sets.

### 2.2 Problem statement
Traders who subscribe to Telegram signal channels must manually read each signal and place the trade themselves. This fails constantly: they sleep through entries, miss stop-loss/take-profit edits and "close now" updates, fat-finger lot sizes, and react too slowly for scalp signals. Existing copiers solve execution but are Windows-VPS-bound, require manual MetaApi setup or per-channel regex configuration, have poor support, and present opaque, promo-code-driven pricing.

### 2.3 Product vision
The cleanest, most reliable, most transparent Telegram→MT5 copier on the market: a 90-second cloud setup with no VPS, no downloads, no manual MetaApi account, LLM parsing that handles any signal format including screenshots, and a plain-English audit log showing exactly what was done and why.

### 2.4 What makes v1.0 win (fundamentals, not new categories)
1. Best-in-class parsing reliability (Claude text + vision) with confidence scoring.
2. Fully-managed execution — the user never touches MetaApi.
3. Transparent audit log explaining every parse and trade decision.
4. Clean, predictable USD pricing including a lifetime option.
5. First-class risk controls (per-trade risk, daily loss cap, per-channel kill switch).
6. Nigerian-built cost base enabling strong human support; naira checkout via Paystack.

---

## 3. Goals and non-goals

### 3.1 Goals (v1.0)
- G1 — A trader can go from sign-up to first auto-executed live trade in under 90 seconds of active setup.
- G2 — Parse and execute signals from any selected Telegram channel without per-channel configuration.
- G3 — Never double-place a trade; never silently lose a signal.
- G4 — Median latency from Telegram message received to broker order confirmed ≤ 1 second.
- G5 — Give the user a complete, human-readable record of every signal and action.
- G6 — Be globally usable (any country, any MT5 broker) while supporting naira checkout.

### 3.2 Non-goals (v1.0)
- N1 — No signal marketplace, discovery, or directory.
- N2 — No signal-provider scoring, leaderboards, or verified track records.
- N3 — No provider-side broadcasting tools (one provider → many subscribers).
- N4 — No managed accounts, pooled funds, or discretionary allocation by VouchFX.
- N5 — No financial advice, signal recommendations, or "expected profit" displays.
- N6 — No native mobile apps (responsive web + an installable PWA shell with push — §6.13 — in v1.0; no offline/caching, no app-store native apps).
- N7 — No platforms beyond MT5 at MVP (cTrader/Deriv/DXTrade/TradeLocker are post-MVP).

---

## 4. Target users

| Persona | Description | Primary need |
|---|---|---|
| **The busy subscriber** | Has a day job, pays for 1–3 VIP signal channels, can't watch the chart all day | Never miss a signal; sane risk defaults |
| **The multi-channel trader** | Follows 4–8 channels, wants per-channel control | Per-channel risk, kill switches, conflict avoidance |
| **The prop-firm trader** | On an FTMO/FundingPips/DXTrade-style funded account | Drawdown protection, stealth execution, daily-loss caps |
| **The Nigerian retail trader** | Uses HFM/Exness/Deriv, price-sensitive, mobile-first, pays in naira | Low-friction naira checkout; Deriv synthetic-indices support (post-MVP) |

Anti-persona (explicitly not designed for in v1.0): institutional/PAMM managers, fund operators, signal sellers wanting to broadcast.

---

## 5. End-to-end user journey

### 5.1 First-run setup (target ≤ 90 seconds active time)
1. **Sign up** — email or Google (Supabase Auth). 7-day free trial unlocked, no card.
2. **Connect Telegram** — QR-code or phone-number login; VouchFX creates an encrypted MTProto session acting as the user's own Telegram client (read-only).
3. **Select channels** — VouchFX lists every channel/group the user is in; user toggles which to copy.
4. **Connect broker** — user enters MT5 server, login, and password (investor/trade password preferred where the broker supports trade-without-withdrawal). VouchFX validates the connection live.
5. **Set risk** — choose Execution Mode (Mirror provider exactly / Apply my risk rules), risk-per-trade (default 0.5%), max trades/day, daily signal limit, news filter on/off. Accept the risk disclaimer.
6. **Go live** — user reviews the summary and goes live. (Testing is the user's choice of connected account: VouchFX treats a broker demo account and a live account identically — users who want to test simply connect their broker's demo account first, then switch to or add their live account when ready. The broker-connect step says this explicitly.)

### 5.2 Steady-state loop (per signal)
1. A message arrives in a selected channel.
2. VouchFX parses it (symbol, side, order type, entries, SL, TPs, confidence, reasoning).
3. VouchFX validates (confidence threshold, SL policy, symbol availability, risk limits, news window).
4. VouchFX sizes the position from the user's risk rule and places the order(s) on the broker.
5. Follow-up messages (edit SL, move to BE, partial close, close all, cancel) are classified and applied to the matching open trade.
6. Every step is written to the audit log and pushed live to the dashboard.

---

## 6. Functional requirements

Priority key (MoSCoW): **M** = Must (MVP), **S** = Should (MVP if time allows), **C** = Could (post-MVP), **W** = Won't (this release).

### 6.1 Authentication & onboarding

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-AUTH-01 | Email + Google sign-up/login via Supabase Auth | M | User can register, verify email, log in, reset password |
| VCH-AUTH-02 | TOTP two-factor authentication | S | User can enable/disable 2FA; login enforces it when enabled |
| VCH-AUTH-03 | 7-day free trial on signup, no card required | M | Trial countdown visible; trial gates at expiry per §11 |
| VCH-ONB-01 | Guided setup wizard (Telegram → channels → broker → risk → done) | M | A new user completes all steps without leaving the wizard; progress is resumable |
| VCH-ONB-02 | Risk disclaimer acknowledgement (click-through) | M | User cannot reach "go live" without accepting; acceptance is logged with timestamp |

### 6.2 Telegram connection & source management

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-TG-01 | Connect user's Telegram via MTProto (QR or phone+code, incl. 2FA password) | M | Session established; encrypted session string stored; status = connected |
| VCH-TG-02 | Read-only behaviour — never send, react, join, leave, or message | M | No outbound MTProto write operations exist in the codebase for user sessions |
| VCH-TG-03 | Auto-list all channels/groups the user belongs to | M | List populates within 5s of connect; searchable/filterable |
| VCH-TG-04 | Enable/disable copying per channel | M | Toggling a channel starts/stops copying within 2s |
| VCH-TG-05 | Per-channel risk overrides | S | A channel can override global risk %, lot mode, SL policy |
| VCH-TG-06 | Per-channel kill switch | M | One tap pauses a channel and closes/leaves-open per user choice |
| VCH-TG-07 | Telegram session health indicator + SpamBot status surfaced | S | Dashboard shows session alive/limited; warns if account restricted |
| VCH-TG-08 | Bot Mode fallback (where user is channel admin and can add a VouchFX bot) | C | Optional alternative ingestion for admin-owned channels |

### 6.3 Broker connection

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-BRK-01 | Connect MT5 account (server, login, password) via fully-managed MetaApi | M | Connection validated live; balance/equity displayed; user never sees MetaApi |
| VCH-BRK-02 | Prefer investor/trade-only password; warn against withdrawal-enabled creds | M | UI guidance shown; field labelled clearly |
| VCH-BRK-03 | Broker symbol-suffix & gold-format auto-detection (XAUUSD/GOLD/.m) | M | Signals map to the correct broker symbol without manual mapping |
| VCH-BRK-04 | Multiple broker accounts per user (gated by plan, §11) | M | User can add up to plan limit; each account independently configurable |
| VCH-BRK-05 | Broker disconnect detection + dashboard banner; auto-resume on reconnect | M | Execution pauses on disconnect; resumes automatically; user notified |
| VCH-BRK-06 | Credential rotation / remove account | M | User can update or delete credentials; deletion undeploys the account |
| VCH-BRK-07 | Platform abstraction layer (executor interface) | M | MT5 implements a generic `Executor` interface; adding cTrader/Deriv requires no core changes |

### 6.4 Signal parsing engine

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-PRS-01 | Parse text signals in any format/language to structured schema (§16.1) | M | Correctly extracts symbol, side, order type, entry/entries, SL, TP1..n on the test corpus (≥50 formats) at ≥98% field accuracy |
| VCH-PRS-02 | Parse image/screenshot signals (vision) | M | Screenshot signals parsed to the same schema; routed to vision model |
| VCH-PRS-03 | Tiered model routing (Haiku 4.5 default → Sonnet 4.6 fallback/vision → Opus 4.8 hard/new-channel) | M | Low-confidence or image inputs escalate automatically; model used is logged |
| VCH-PRS-04 | Confidence score per parse; threshold gating | M | Below-threshold parses are not executed; flagged for user review |
| VCH-PRS-05 | Plain-English reasoning per parse | M | Every parsed signal stores a human-readable explanation shown in the audit log |
| VCH-PRS-06 | Prompt caching of system prompt / symbol glossary | M | Cached-input discount applied; verified in cost logs |
| VCH-PRS-07 | Follow-up classification (MODIFY_SL, MODIFY_TP, MOVE_TO_BE, CLOSE_PARTIAL, CLOSE_ALL, CANCEL_PENDING, NEW_SIGNAL, IGNORE) | M | A reply/edit in a channel with a related order/position is classified with prior-signal context and applied to the matching trade |
| VCH-PRS-07b | Interpret provider cancel/close instructions in any phrasing ("cancel", "delete that order", "close now", "exit", "no longer valid", "scrap it") and map to the correct action | M | A free-text cancel/close message resolves to CANCEL_PENDING (unfilled) or CLOSE_ALL/CLOSE_PARTIAL (filled) for the correct trade |
| VCH-PRS-07c | Telegram message **deletion/edit** of a prior signal is treated as a cancel instruction | M | If a provider deletes or edits a signal whose pending order has not filled, VouchFX cancels the pending order; if already filled, it flags for the user per their close policy and logs it |
| VCH-PRS-08 | Handle entry ranges and pip-based / %-based SL & TP | M | "BUY 3000-3010", "SL 30 pips", "TP 1.5%" parse correctly |
| VCH-PRS-09 | New-channel learning pass (first N signals via top model) | S | First N signals of a new channel use Opus 4.8 to calibrate format handling |

### 6.5 Trade execution engine

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-EXE-01 | Place market and pending orders (buy/sell, limit/stop) on MT5 | M | All six order types execute correctly against a live demo account |
| VCH-EXE-02 | Multi-TP with per-TP lot allocation | M | A multi-TP signal splits volume per user's allocation (e.g. 25/50/25) |
| VCH-EXE-03 | Position sizing: % balance risk, fixed lot, or fixed $ risk | M | Computed lot matches the configured rule given entry/SL distance |
| VCH-EXE-04 | Idempotent execution keyed on (chat_id, message_id, edit_version) | M | Worker restart or duplicate delivery never opens a second trade for the same signal |
| VCH-EXE-05 | Regional worker co-location (MetaApi NY/London) for latency | S | Median message→order-confirmed ≤ 1s in test |
| VCH-EXE-06 | Skip-with-reason when validation fails | M | Skipped signals show a reason (e.g. "no SL detected", "daily trade cap reached") |
| VCH-EXE-06b | Execute cancel/close actions on the broker: delete unfilled pending orders (CANCEL_PENDING), and close/partially close open positions (CLOSE_ALL/CLOSE_PARTIAL/MOVE_TO_BE) | M | The correct broker order/position is cancelled or closed within latency target; result and source message are logged |
| VCH-EXE-06c | Match a cancel/close instruction to the right trade(s) by channel + symbol + originating signal; ignore if no matching VouchFX-managed order exists | M | Cancel/close affects only the trade(s) opened from that channel's matching signal; unrelated trades are untouched |
| VCH-EXE-07 | Manual replay of a missed signal (admin/user) | S | Replaying a signal respects idempotency (no double-trade) |

### 6.6 Risk management

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-RSK-01 | Global risk-per-trade setting (default 0.5%) | M | Applied to sizing unless a channel override exists |
| VCH-RSK-02 | Max trades per day | M | Trades beyond the cap are skipped with reason |
| VCH-RSK-02b | User-set daily signal limit (global and per-channel) | M | User sets a max number of signals to act on per day; once reached, further signals that day are skipped with reason ("daily signal limit reached"); counter resets at the user's configured day-rollover time; per-channel limit overrides global where set |
| VCH-RSK-03 | Max daily loss / equity drawdown cap → pause + optional close-all | M | On breach, copying pauses; user notified; resumes next day or on manual resume |
| VCH-RSK-04 | Default-SL policy when a signal omits SL (apply default / skip / ask) | M | User-selected policy is enforced consistently |
| VCH-RSK-05 | Breakeven-after-TP1 and trailing-after-TP2 | S | SL moves to entry after TP1; trails after TP2 when enabled |
| VCH-RSK-06 | News filter (skip high-impact event windows) | S | Trades within a configurable window around high-impact news are skipped with reason |
| VCH-RSK-06b | Economic calendar feed: **JBlanked News API (free tier)** as primary source — ONE scheduled fetch per day (free tier limit: 1 request/day), normalised into a Postgres `calendar_events` cache (event, currency, UTC timestamp, impact); the news filter reads ONLY the cache, never the live feed | S | The daily fetch populates the cache; filter decisions query Postgres; the single daily request is never exceeded |
| VCH-RSK-06c | Calendar fail-safe + fallback: if the cache is stale (>48h) or the daily fetch fails, fall back to the Forex Factory weekly JSON (`nfs.faireconomy.media`, max 2 fetches/5min, used sparingly); if both fail, prop-firm accounts fail SAFE (block trading in typical high-impact windows) and ops is alerted via Telegram/email | S | A stale cache triggers the fallback fetch; dual failure triggers conservative blocking on prop accounts + an ops alert; timestamps are converted to UTC at ingest and DST-tested |
| VCH-RSK-07 | Stealth execution (randomised delay / hidden comment) for prop accounts | C | Optional delay and neutral order comment when enabled |
| VCH-RSK-08 | Reverse-trade mode (invert side) per channel | C | When enabled, buy↔sell inverted for that channel |
| VCH-RSK-09 | **Execution Mode** — "Mirror provider exactly" vs "Apply my risk rules", settable globally and per-channel (per-channel overrides global) | M | In Mirror mode, the provider's SL and TP prices are placed unchanged and no default-SL substitution, breakeven, or trailing is applied unless the user explicitly opts in; in Apply-my-rules mode the full risk engine governs (default) |
| VCH-RSK-10 | Mirror-mode lot sizing sub-choice: use the provider's stated lot (if present) / fixed lot / risk-based — mirroring the *levels* is independent of choosing the *size* | M | The volume is determined by the selected sub-mode; if "provider's stated lot" is chosen but none is given, fall back to the user's configured default (fixed or risk-based) |
| VCH-RSK-11 | No-stop-loss acknowledgement in Mirror mode: placing a trade with no SL requires an explicit, separate opt-in ("Allow trades with no stop loss — I understand the risk"); otherwise the no-SL signal is skipped-with-reason | M | A no-SL signal in Mirror mode is only executed if the acknowledgement is on; the acknowledgement is logged |
| VCH-RSK-12 | Hard caps still apply in Mirror mode: daily signal limit, max trades/day, and daily loss cap remain enforced regardless of Execution Mode (these are account-safety guardrails, not signal adjustments) | M | A Mirror-mode signal that breaches a cap is still skipped/paused with reason (see §14 R12 if "raw" mode is ever wanted) |

### 6.7 Trade lifecycle & dashboard

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-DSH-01 | Live dashboard: open trades, today's activity, account balance/equity | M | Updates in near-real-time via Supabase Realtime |
| VCH-DSH-02 | Audit log per signal: raw message, parsed JSON, reasoning, action sent, broker response, PnL | M | Every signal is inspectable end-to-end |
| VCH-DSH-03 | Trade event timeline (SL→BE, TP1 hit, partial close, pending-order cancelled, closed-by-signal) | M | Each event recorded with source message reference, including cancels triggered by a provider message or message-deletion |
| VCH-DSH-04 | Filter/search history by channel, symbol, date, outcome | S | Returns correct subset |
| VCH-DSH-05 | ~~Demo-first mode~~ — REMOVED by decision: VouchFX runs signals on whatever MT5 account the user connects (demo or live, treated identically). Testing = the user connects their broker's demo account. The broker-connect UI notes this option | W | The broker-connect step displays guidance that a demo account can be connected for testing; no separate demo-execution subsystem exists |

### 6.8 Notifications

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-NOT-01 | In-app + email alerts: broker disconnect, daily-loss-cap hit, Telegram session limited, trade opened/closed (configurable) | M | Alerts fire for the selected events |
| VCH-NOT-02 | Telegram DM notifications (optional) | C | User can opt into VouchFX DM alerts |

### 6.13 PWA shell (installable + push)

A **light** PWA: installable to home screen + web push for the existing notification events. Offline/caching is explicitly out of scope (the product runs on always-on server workers; the device is a dashboard, so offline buys little).

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-PWA-01 | Web app manifest + icon set + theme colors, making the app installable ("Add to home screen") on Android, iOS, and desktop | S | The app passes installability checks and can be added to the home screen with the VouchFX icon and dark theme |
| VCH-PWA-02 | Minimal service worker for installability + push only — **no offline caching of app data or routes** | S | A service worker registers and enables install + push; it does not cache API responses or trades data |
| VCH-PWA-03 | Web push notifications for the `VCH-NOT-01` events (trade opened/closed, broker disconnect, daily-loss-cap hit, Telegram session limited) — user opt-in, permission requested in-context (not on first load) | S | A subscribed user receives a push for each enabled event; push respects the same per-event toggles as in-app/email |
| VCH-PWA-04 | Push subscription management: store/refresh subscriptions per device, allow disabling push per device, handle iOS PWA constraints (push works only once installed to home screen) | S | Subscriptions persist and can be revoked; iOS users are guided to install first if they enable push |

Note: web push shares the `VCH-NOT-01` event model and toggles — it is a third delivery channel alongside in-app and email, not a separate notification system.

### 6.9 Billing & subscriptions

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-BIL-01 | Stripe for global card billing (subscriptions + one-off Lifetime) | M | User can subscribe to any tier and buy Lifetime; Stripe Billing handles renewals, dunning, invoices |
| VCH-BIL-01b | Stripe Tax enabled for global VAT/sales-tax calculation | M | Applicable tax is calculated at checkout per the billing entity's obligations |
| VCH-BIL-02 | Paystack for Nigerian buyers (NGN at point of charge) | M | Nigerian user can pay in naira for the same SKUs |
| VCH-BIL-03 | Plan gating & enforcement (account limits, feature flags per §11) | M | Exceeding plan limits is blocked with an upgrade prompt |
| VCH-BIL-04 | Lifetime SKU purchase + entitlement | M | One-off payment grants lifetime entitlement; recorded and enforced |
| VCH-BIL-05 | Trial expiry → downgrade/lock; upgrade/cancel self-serve | M | At trial end, execution stops until a plan is purchased |

### 6.10 Admin & operations

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-ADM-01 | Per-user health view (TG session, broker, last signal/trade age, error rate) | M | Ops can see status for any user |
| VCH-ADM-02 | Worker supervision: heartbeat, auto-restart, backoff | M | A dead listener is detected and restarted within 60s |
| VCH-ADM-03 | Structured audit/event logging (no credentials in logs) | M | Logs contain no secrets; every key action is traceable |
| VCH-ADM-04 | Manual account undeploy/redeploy (cost control on inactivity) | S | Inactive accounts can be undeployed and auto-redeploy on next signal |

### 6.11 Referral & affiliate

Two distinct programs. **Provider affiliate** is the primary acquisition channel (signal-channel owners refer their subscribers in clusters); **user referral** is a classic SaaS friend-gets-friend loop. Both pay a **20% commission** and are clean under the execution-tool model (VouchFX pays for referrals; it does not rank, vouch for, or recommend any provider).

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-REF-01 | Provider affiliate program: unique referral link + code per affiliate; **20% recurring commission** on the subscription payments of users they refer | M | An affiliate gets a working link/code; a signup via that link is attributed to them; commission accrues at 20% of each collected payment |
| VCH-REF-02 | Affiliate dashboard: clicks, signups, trial→paid conversions, active referrals, earnings (pending vs paid), payout history | M | All figures display from mock/real data; updates as referrals convert |
| VCH-REF-03 | Attribution: tracked via link/code (cookie + binding at signup); attributed for the life of the referred subscription; last-touch wins | M | A referred user remains attributed across renewals until they churn |
| VCH-REF-04 | Commission accrues only on successfully collected paid subscriptions (not trials); clawback on refund/chargeback | M | Trial signups earn $0; a refunded payment reverses its commission |
| VCH-REF-05 | Payouts: minimum threshold ($50), monthly cycle, via Paystack (NGN) / bank / Wise / crypto; payout method set by affiliate. Requesting a payout **locks** the balance (moves pending→processing), never zeroes it; it clears only on paid and restores on failed (see VCH-ADMIN-03). Disbursement is actioned via the admin console (manual at launch) | M | Below threshold rolls over; at/above threshold is payable; method selectable; a requested-but-unpaid payout never destroys the balance |
| VCH-REF-06 | User referral program: every user has a referral link; **referrer earns 20% recurring as account credit**; **referred user gets 20% off their first month** | S | Referrer's next invoice is credited; referred user's first charge is discounted 20% |
| VCH-REF-07 | Share assets: one-tap copy of referral link, a ready-made Telegram message, and a QR code | S | User can copy link/message and download/scan QR |
| VCH-REF-08 | Fraud & abuse controls: self-referral blocked, duplicate-account/device detection, commission only post-conversion | M | Self-referral and obvious duplicate signups earn no commission |
| VCH-REF-09 | Co-branded landing page per top affiliate (channel name + their link) | C | An affiliate can be issued a co-branded acquisition page |

**Commission note:** flat **20%** for both programs at launch. Structure can later be stepped (e.g. 20% for 12 months then lower) or tier-restricted to protect Starter-tier margin — see PRD §14 R9. Commission is on subscription revenue only; Lifetime purchases pay 20% one-off, not recurring.

### 6.12 Prop Mode (prop-firm rule engine) — Phase 2

Makes VouchFX prop-firm-native: the user selects their firm + challenge, VouchFX loads that firm's exact ruleset and enforces all of it in real time. This is a **Phase 2** module (all items priority **C** = post-MVP) and builds on the existing risk features (`VCH-RSK-03` drawdown guardian, `VCH-RSK-06` news filter, `VCH-RSK-07` stealth) rather than duplicating them. Positioning is **protection, not evasion**: VouchFX enforces *your* firm's rules so you don't breach them by accident. **Phase 2 ships Prop Mode on MT5 only** (reaching MT5-based prop firms); the rule engine is platform-agnostic logic and extends to cTrader/DXTrade/TradeLocker automatically once those land in Phase 3.

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-PROP-01 | Firm rule library: versioned, per-firm/per-challenge presets (daily loss, max/trailing drawdown + model, consistency %, news window, weekend/min-days, copy/EA permission), each with a "last verified" date shown to the user. **Launch criterion: only firms that explicitly permit copy trading / EAs are included** | C | Selecting a firm+challenge loads its ruleset; the verification date is visible; presets are versioned; every included firm permits copy trading |
| VCH-PROP-02 | Per-account rule profile: each broker account can run a different firm ruleset simultaneously | C | A user with 3 prop accounts across 2 firms enforces the correct ruleset per account independently |
| VCH-PROP-03 | Real-time equity guardian: watch equity tick-by-tick (not balance) and pre-block or auto-flatten before an equity-based intraday daily-loss or drawdown limit is touched | C | A signal that would breach the live equity limit is blocked/flattened before the threshold; logged with reason |
| VCH-PROP-04 | Drawdown tracker: model-aware (static / EOD trailing / intraday trailing), tracks the current floor, refuses trades that would breach it | C | Trades that would cross the tracked floor are skipped-with-reason; floor updates per the firm's model |
| VCH-PROP-05 | Consistency manager: cap daily profit so no single day exceeds the firm's consistency % of total profit; throttle/pause copying as the day nears the cap; show profit-distribution status | C | Once a day's profit approaches the threshold, further copying is throttled/paused with reason; a consistency meter is displayed |
| VCH-PROP-06 | Firm-tuned news auto-flatten: use each firm's exact pre/post-event window (not a generic toggle) | C | Trades inside the firm's specific news window are skipped/closed with reason |
| VCH-PROP-07 | Weekend / min-trading-days handling: auto-close before Friday close where the firm bans weekend holding; help distribute trades to meet minimum trading days | C | Positions are flat before weekend for firms that require it; min-days progress is tracked |
| VCH-PROP-08 | Stealth execution for multi-account detection: randomised lot within the risk budget, micro-delays, slight SL/TP variation, neutral comments — to avoid copy-group flagging | C | Two accounts copying the same signal do not place identical orders; variation parameters are configurable |
| VCH-PROP-09 | Copy/EA permission awareness: warn the user if their selected firm restricts copy trading or EAs; never silently assist a TOS breach | C | A firm flagged as copy-restricted shows a clear warning before the user enables copying |
| VCH-PROP-10 | Pre-trade rule simulation + explainability: before executing, show pass/fail against the active ruleset ("would breach FTMO daily loss") in the audit log | C | Each prop-account signal shows which rules it passed/failed prior to execution |

**Rule Monitor agent (keeps the firm rule library current).** An AI agent monitors supported firms and proposes updates; an assigned human approves the high-stakes ones. This is how the rule library (`VCH-PROP-01`) stays current without manual trawling, and it doubles as the liability record.

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-PROP-11 | Scheduled Rule Monitor agent: on a schedule (e.g. daily), fetch each supported firm's rules/terms source, extract the structured ruleset with an LLM into the rule schema, and diff against the stored record | C | The agent runs on schedule; for each firm it produces a structured ruleset + a diff vs the current stored version; the source URL and fetch time are recorded |
| VCH-PROP-12 | Confidence-tiered publishing: high-confidence changes to low-stakes fields (e.g. news-window minutes) may auto-publish (logged + reversible); ANY change to account-killing fields (daily loss, drawdown model/%, consistency %) ALWAYS requires human approval regardless of confidence; low-confidence or messy-source changes are flagged for human entry | C | An account-killing-field change never goes live without approval; a low-stakes high-confidence change can auto-publish; low-confidence changes are queued, not published |
| VCH-PROP-13 | Approval queue + approver role: a first-class "rule approver" permission and a queue showing each flagged change as old → new value, source link, detected date, and agent confidence, with Approve / Reject / Edit actions | C | An approver sees the queue, can open the source, and approve/reject/edit; non-approvers cannot publish rule changes |
| VCH-PROP-14 | Version-stamping + audit trail: every ruleset version stores who/what published it (agent auto or approver name), when, and the source; the user-facing "rules last verified" date reflects the latest verification | C | Each firm preset shows a last-verified date; every change is attributable to an actor and source in an append-only log |
| VCH-PROP-15 | Reversible rollback: any published ruleset version can be rolled back to a prior version | C | An approver can revert a firm to a previous ruleset version; the rollback is logged |

### 6.14 Admin console

A single role-gated admin area for VouchFX operations — consolidating what were scattered/orphaned surfaces (payouts, ops health, the rule approval queue) plus the user/subscription lookup support needs. Access via an `admin` role/permission; every admin action is written to `audit_events`.

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| VCH-ADMIN-01 | Role-gated admin area: an `admin` permission distinct from end users (and from the `rule_approver` role); all admin routes server-side authorised | M | Non-admins cannot access or call any admin route; access is enforced server-side, not just hidden in UI |
| VCH-ADMIN-02 | Payout management: list payout requests with affiliate, amount, method, status; approve, mark paid (recording `provider_transfer_id` / reference), or mark failed | M | An admin can move a payout pending → processing → paid/failed; each transition is logged and attributable |
| VCH-ADMIN-03 | **Payout balance safety (fixes the zeroing defect):** requesting a payout moves the amount from `pending` into a `locked/processing` state — it is NOT zeroed. Balance clears only when the payout is marked **paid**; a **failed** payout returns the amount to `pending` | M | A requested-but-unpaid payout never destroys the affiliate's balance; a failed disbursement restores it automatically |
| VCH-ADMIN-04 | User & subscription lookup (support): search a user; view their plan/subscription status, broker/Telegram connection status, recent signals/trades, and referral/affiliate state | M | An admin can locate any user and see the state needed to resolve a support request |
| VCH-ADMIN-05 | Ops health view (absorbs VCH-ADM-01): per-user Telegram session, broker status, last signal/trade age, error rate, feed health | M | The ops health view lives within the admin console |
| VCH-ADMIN-06 | Rule Monitor approval queue (absorbs the Phase 2 VCH-PROP-13 queue) lives within the admin console under the `rule_approver` role | C | The rule approval queue is a section of the admin console |
| VCH-ADMIN-07 | Subscription actions: view invoices and, where the processor allows, trigger a refund/cancel (Stripe/Paystack) with the action logged | S | An admin can action a refund/cancel for a user; the action and processor result are logged |

Note: automated payout disbursement (Stripe/Paystack/Wise/crypto Transfers) is **deferred** — payouts are actioned manually by an admin at low volume (VCH-REF-05's monthly cycle). The admin console makes manual payouts safe and auditable; automation is added when volume justifies it.

---

## 7. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Latency | Median Telegram-message-received → broker-order-confirmed ≤ 1s; p95 ≤ 2s |
| NFR-02 | Reliability | No silent signal loss; ≤ 1 missed signal per user per week target; double-execution rate target 0 |
| NFR-03 | Availability | 24/7 worker operation; per-user listener auto-recovers; target 99.5% control-plane uptime |
| NFR-04 | Scalability | Architecture supports 3,000+ concurrent users without redesign; worker pools scale horizontally |
| NFR-05 | Security | Credentials & session strings AES-GCM encrypted at rest (KMS-wrapped); decrypted only in worker memory; never logged; TLS in transit; RLS multi-tenant isolation |
| NFR-06 | Privacy | Store only what's needed; user can delete account, broker creds, and Telegram session |
| NFR-07 | Observability | Per-signal trace; per-user health metrics; error alerting to ops |
| NFR-08 | Cost | Per-Starter-user variable COGS tracked; alert if MetaApi/LLM spend per user exceeds budget |

---

## 8. Data model (reference)

Core tables (see blueprint for full DDL): `users`, `telegram_sessions`, `broker_connections`, `signal_sources`, `risk_settings`, `parsed_signals`, `trades`, `trade_events`, `audit_events`, `subscriptions`.

Key constraints:
- `parsed_signals (source_id, tg_message_id)` — unique index (idempotency foundation).
- A trade opens only if no OPEN `trades` row exists for that `parsed_signal_id` (`INSERT ... ON CONFLICT DO NOTHING`).
- Postgres Row-Level Security scopes all reads/writes to `auth.uid()`.

---

## 9. System architecture (summary)

- **Frontend:** Next.js (Vercel) — marketing, dashboard, settings, audit log, billing.
- **Data/auth:** Supabase (Postgres + Auth + RLS + Realtime + Vault).
- **Telegram listeners:** always-on MTProto clients (Telethon/GramJS) on Fly.io, one process per user, read-only.
- **Parsing:** Claude — Haiku 4.5 (default) → Sonnet 4.6 (fallback/vision) → Opus 4.8 (hard/new-channel), structured output + prompt caching.
- **Execution:** MetaApi (managed MT5) behind a generic `Executor` interface; regional worker pools; BullMQ on Upstash Redis for queueing.
- **Payments:** Stripe (global cards/subscriptions) + Paystack (Nigeria, NGN).
- **Ops:** BetterStack/Sentry + Postgres audit log.

Vercel serverless is **not** used for listeners or execution loops (no long-lived connections); those run on Fly.io machines.

---

## 10. Integrations & dependencies

| Dependency | Use | Risk owner note |
|---|---|---|
| Telegram MTProto (Telethon/GramJS) | Read signals | Account-safety: strict read-only; user's own session |
| MetaApi.cloud | MT5 execution | Per-account cost & outage risk; verify live pricing; plan Phase-2 self-host failover |
| Anthropic Claude API | Parsing | Multi-model fallback; prompt caching mandatory |
| Supabase | DB/auth/storage/realtime | RLS correctness is security-critical |
| Fly.io | Always-on workers | Heartbeat + auto-restart |
| Stripe | Global billing (cards, subscriptions, Lifetime) | Requires a non-Nigerian billing entity (UK Ltd / US LLC); VAT/sales-tax handled via Stripe Tax + accountant (not Merchant-of-Record) |
| Paystack | Nigeria billing | NGN settlement |
| Resend | Email | Transactional notifications |
| JBlanked News API (free) | Economic calendar for the news filter | Hard limit 1 request/day on free tier — daily cached pull only; indie single-dev service, no SLA; re-publishes FF/MQL5/FXStreet data (unofficial-source caveat); FF weekly JSON as fallback; fail-safe blocking on dual failure |

---

## 11. Plans & feature gating (USD)

| Feature | Free trial (7d) | Starter $19/mo | Pro $39/mo | Funded $79/mo | Lifetime $399 |
|---|---|---|---|---|---|
| Broker accounts | 1 | 1 | 3 | 10 | 3 |
| Channels | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| Signals/day | 1 cap | Unlimited | Unlimited | Unlimited | Unlimited |
| Text + vision parsing | ✓ | ✓ | ✓ | ✓ | ✓ |
| Audit log | ✓ | ✓ | ✓ | ✓ | ✓ |
| Prop-firm features (drawdown guardian, stealth, news filter) | — | — | ✓ | ✓ | ✓ |
| Prop Mode — firm rule engine (Phase 2; §6.12) | — | — | — | ✓ | — |
| Priority execution region | — | — | ✓ | ✓ | ✓ |
| Multi-region failover | — | — | — | ✓ | — |
| Priority human support | — | — | — | ✓ | — |
| Naira checkout (Paystack) | — | ✓ | ✓ | ✓ | ✓ |

Notes: Starter uses regular-reliability MetaApi; Pro/Funded use high-reliability. Lifetime maps to Pro features at 3 accounts (see blueprint §5.3 for the COGS tail-risk caveat). **Prop Mode (§6.12)** ships in Phase 2 on the **Funded tier** (decision per R11); a dedicated premium Prop tier is deferred to Phase 3 when multi-platform coverage strengthens the premium offering.

---

## 12. Success metrics / KPIs

| Metric | Target (first 90 days post-launch) |
|---|---|
| Setup completion rate (signup → first connected broker) | ≥ 60% |
| Time-to-first-auto-trade (active setup time) | ≤ 90s median |
| Missed-signal rate | ≤ 1 / user / week |
| Double-execution rate | 0 |
| Median execution latency | ≤ 1s |
| Trial → paid conversion | ≥ 8% |
| Referral/affiliate-driven signups | ≥ 25% of new signups by month 6 |
| 30-day logo retention | ≥ 70% |
| Support first-response time | ≤ 30 min (business hours) |
| Trustpilot rating | ≥ 4.2 within 6 months |

---

## 13. Release plan / phasing

| Phase | Scope | Exit criteria |
|---|---|---|
| **Phase 0 — Spike** | Single-user vertical slice: Telethon → Claude parse → MetaApi MT5 execute → minimal dashboard | 50 consecutive signals across 5 live channel formats executed correctly; e2e < 2s |
| **Phase 1 — Closed beta (MVP)** | All **M** requirements; Supabase multi-tenancy + RLS; Fly.io listener-per-user; queue; audit log; risk settings; Paystack | 30-day beta with 20 users: missed ≤1/user/week; double-exec 0; NPS > 40 |
| **Phase 2 — Public launch** | **S** requirements; vision parsing hardening; Stripe (global) + Stripe Tax; prop-firm features; **Prop Mode rule engine (§6.12), MT5-only**; Lifetime SKU; affiliate program. *Multi-platform deferred to Phase 3 — Prop Mode in this phase reaches MT5-based prop firms only.* | 1,000 paying users; stable COGS |
| **Phase 3 — Platforms & margin** | **Multi-platform: cTrader Open API, DXTrade, TradeLocker, Deriv** (new Executor implementations behind the existing interface) — extends Prop Mode to non-MT5 firms; self-hosted MT5-on-Wine failover; MetaApi B2B rate | Multi-platform live; blended Starter COGS < $5/mo; gross margin > 70% |

MVP = Phase 1 = all **M**-priority requirements above.

---

## 14. Risks & open questions

| # | Risk / question | Owner | Status |
|---|---|---|---|
| R1 | MetaApi live pricing must be confirmed (log into app.metaapi.cloud) before final unit-economics | Client/Build | Open |
| R2 | Telegram account-ban risk for heavy users — confirm read-only mitigations sufficient | Build | Open |
| R3 | Confirm target brokers permit automated/EA trading (Exness, HFM, FXTM, Pepperstone, prop firms) | Client | Open |
| R4 | Lifetime SKU long-tail COGS — confirm cap & migration right in ToS | Client | Open |
| R5 | Default-SL policy default value (apply default vs skip) — product decision | Product owner | Open |
| R6 | Demo-first mode — **resolved: removed entirely.** Users test by connecting a broker demo account themselves; VouchFX treats demo and live MT5 accounts identically. Eliminates demo-slot plan-limit exceptions, MetaApi demo-account lifecycle costs, and channel→account routing complexity | Product owner | Resolved |
| R7 | Disclaimer / ToS wording — "execution tool, user-controlled, no advice" framing | Client/legal | Open |
| R8 | Which Anthropic models are pinned at build time (Haiku 4.5 / Sonnet 4.6 / Opus 4.8 assumed) | Build | Open |
| R9 | Referral/affiliate commission is flat 20% recurring — confirm whether to keep flat, step down after 12 months, or restrict on Starter tier to protect margin (Starter gross margin is ~$10; 20% ≈ $3.80) | Client | Open |
| R10 | Stripe billing entity — Stripe is not available to Nigerian-registered businesses, so global billing must run through a UK Ltd (e.g. AkomzyAi) or US LLC; confirm which entity bills customers and who owns VAT/sales-tax filing. Paystack covers Nigerian/NGN buyers regardless. | Client | Open |
| R11 | Prop Mode (§6.12) — **resolved**: (a) maintenance via the Rule Monitor agent (VCH-PROP-11..15) with the approver as a **fillable role**; (b) launch firms restricted to those **explicitly permitting copy trading/EAs** (e.g. FundingPips, The5ers, FXIFY, BrightFunded — verify at seeding); (c) **pricing: Prop Mode ships on the Funded tier ($79)** — a dedicated premium Prop tier is deferred to Phase 3, when multi-platform coverage strengthens the premium offering (entitlement check is flag-based per P2.13, so the tier can be introduced without restructuring). Launch-firm count to be set at seeding (P2.2). | Client/Product | Resolved |
| R12 | Execution Mode — confirmed default is that hard caps (daily signal limit, max trades/day, daily loss cap) stay enforced even in "Mirror provider exactly" mode. Confirm this is desired, or whether a fully-raw mode (caps off) should ever be offered (not recommended — account-safety risk) | Client/Product | Open |

---

## 15. Out of scope (v1.0) / future roadmap

Explicitly deferred (these are the deferred differentiators, not abandoned):
- Signal-provider broadcasting (one provider → many subscriber accounts). *Note: the provider **affiliate** program (§6.11) IS in scope — it pays providers to refer users; it does not let them broadcast trades.*
- Provider performance verification / scoring / leaderboards ("verified by VouchFX").
- Public performance dashboards and a signal marketplace.
- Managed/pooled accounts or any discretionary allocation.
- Native iOS/Android apps.
- Cross-channel portfolio risk netting (correlated-exposure capping across providers).

These remain candidates for a later major version once the core copier is proven and retained.

---

## 16. Appendix

### 16.1 Parsed-signal schema (LLM structured output)

```json
{
  "symbol": "XAUUSD",
  "side": "buy",
  "order_type": "market | limit | stop",
  "entries": [3000.0, 3010.0],
  "sl": 2980.0,
  "sl_unit": "price | pips | percent",
  "tps": [3030.0, 3050.0, 3080.0],
  "tp_unit": "price | pips | percent",
  "confidence": 0.0,
  "reasoning": "string — plain-English explanation of the parse",
  "follow_up_type": "NEW_SIGNAL | MODIFY_SL | MODIFY_TP | MOVE_TO_BE | CLOSE_PARTIAL | CLOSE_ALL | CANCEL_PENDING | IGNORE",
  "language_detected": "string",
  "source_message_id": "string"
}
```

### 16.2 Glossary
- **MTProto** — Telegram's native client protocol; lets VouchFX read channels the user belongs to.
- **MetaApi** — cloud API that runs/controls MT4/MT5 terminals; how VouchFX executes trades.
- **Executor interface** — internal abstraction so MT5, cTrader, Deriv, etc. share one execution contract.
- **Idempotency key** — `(chat_id, message_id, edit_version)`; guarantees one signal → at most one trade.
- *(Demo-first mode removed — testing is done by connecting a broker demo account, which VouchFX treats identically to live.)*
- **Stealth execution** — randomised delay + neutral order comment to satisfy prop-firm rules.
- **Consistency rule** — a prop-firm rule capping how much of total profit may come from a single day (typically 20–50%); breaching it can lock a payout even if all other rules pass.
- **Trailing drawdown** — a max-loss floor that moves with profit; models differ: static (fixed), EOD trailing (moves once at day close), intraday trailing (tightens on every spike).
- **Equity guardian** — VouchFX watching account equity tick-by-tick to block/flatten before an equity-based intraday limit is breached.
- **Prop Mode** — VouchFX enforcing a selected prop firm's full ruleset per account, in real time (§6.12).
- **Execution Mode** — per-user/per-channel choice between "Mirror provider exactly" (place the provider's SL/TP unchanged, no auto-adjustments) and "Apply my risk rules" (the risk engine sizes and manages the trade). Hard caps apply in both.

---

*End of PRD v1.0 (Draft). Next artefacts in the documentation-first flow: CLAUDE.md + SKILL.md, then the Phase 0 → Phase 1 build-prompt sequence for Claude Code.*
