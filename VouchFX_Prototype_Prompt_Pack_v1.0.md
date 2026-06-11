# VouchFX — Prototype Prompt Pack (v1.0)

**Purpose:** Paste-ready prompts to generate a high-fidelity, clickable VouchFX prototype on **claude.ai** (React artifacts), to validate UX before the production build.

**How to use:**
1. Start a new chat on claude.ai.
2. Paste **Prompt 0 (Design Brief)** first and let it acknowledge — or prepend it to each screen prompt.
3. Then paste any screen prompt (Prompts 1–7). Each produces one self-contained React artifact.
4. Use **Prompt 8** if you want a single navigable multi-screen prototype for a client demo.
5. Iterate with follow-ups like "make the sidebar collapsible" or "show the empty state."

**Notes:** These are *design/UX* prototypes — all data is mocked, no real integrations. They are not the functional build (that's the later CLAUDE.md + build-prompt sequence).

---

## Prompt 0 — Design Brief (paste first / prepend to each)

```
You are helping me prototype the UI for "VouchFX", a SaaS product that automatically copies trading signals posted in Telegram channels onto a trader's MetaTrader 5 (MT5) account. It parses each signal with AI and executes the trade under the user's risk rules. Brand values: trustworthy, fast, transparent.

Use this design language for everything you build (call it the VouchFX design language):
- Aesthetic: modern fintech, dark-first, clean and data-precise. Confident, not playful. Think a refined trading dashboard, not a consumer app.
- Background: near-black slate (#0B0F14). Surfaces/cards: #151B23 with subtle 1px borders (#222B36). Elevated panels slightly lighter.
- Primary accent (actions, links, active states, "verified/connected"): teal #14B8A6.
- Text: primary #E6EDF3, secondary #8B98A5, muted #5B6772.
- Semantic colors are RESERVED ONLY for trade P&L and status: profit green #22C55E, loss red #EF4444, warning amber #F59E0B. Never use green/red for generic UI accents — only for money and connection status.
- Typography: clean geometric sans (use the default system/Inter-style font). All numbers, prices, lots, and P&L use a monospace, tabular-figures font for alignment.
- Components: rounded-xl cards, soft borders over heavy shadows, status pills (connected/disconnected/paused), compact data rows, generous but efficient spacing.
- Iconography: lucide-react.
- Fully responsive and mobile-first (target users trade on phones). On mobile, navigation collapses to a bottom bar or hamburger.

Build everything as a single-file React component (default export), Tailwind utility classes only, lucide-react for icons, recharts only if a chart is needed. No backend, no real API calls — use realistic inline mock data. Use realistic forex specifics: symbols like XAUUSD, EURUSD, GBPJPY, US30; brokers like Exness, HFM, FXTM, Deriv; lots like 0.12; signal text with emojis and multiple TPs.

Confirm you've absorbed this, then wait for the screen I ask you to build.
```

---

## Prompt 1 — Marketing landing page

```
Using the VouchFX design language, build the VouchFX marketing landing page as a single responsive React artifact.

Sections, top to bottom:
1. Sticky top nav: VouchFX wordmark (teal dot + "VouchFX"), links (Features, How it works, Pricing, a subtle Telegram icon+label linking to https://t.me/getvouchfx in a new tab, Login), and a teal "Start free trial" button.
2. Hero: headline "Your Telegram signals, traded automatically on MT5." Subhead: "Any signal, any format, executed under your own risk rules. Whether you trade a live account or a funded one, VouchFX keeps every trade inside your limits." Keep the page audience-neutral — everyday live-account traders are the primary audience; prop support is a supported use case, never the identity. Two CTAs: "Start 7-day free trial" (teal) and "See how it works" (ghost). To the right (or below on mobile), a stylized mock of a Telegram signal message turning into an executed MT5 trade card (show the signal text → an arrow → a trade ticket with symbol XAUUSD, BUY, 0.12 lots, SL/TP, and a small green +$84.20).
3. Trust strip: "Works with any MT5 broker" with logos-as-text pills (Exness, HFM, FXTM, Deriv, IC Markets) and small stats (e.g. "<1s execution", "Any signal format", "No VPS, no downloads").
4. How it works: 3 steps — Connect Telegram, Connect your broker, Set your risk — each with an icon and one line.
5. Feature grid (6 cards): AI parsing (text + screenshots), Fully-managed execution (no MetaApi setup), Transparent audit log, Risk controls (daily signal limit, daily loss cap), Funded-trader friendly (daily-loss, drawdown & consistency guardrails) — as just ONE card among the others, not a hero theme, Naira & card checkout.
6. Pricing: 4 cards — Starter $19/mo, Pro $39/mo (highlighted "Most popular"), Funded $79/mo, Lifetime $399 one-off — with the key gating differences (broker accounts, prop-firm features). A note: "Pay in USD or naira."
6b. Rule-monitor band (between the feature grid and pricing): headline "Prop firm changed the rules? We already know." Body: "Our AI agent monitors your prop firm around the clock — drawdown limits, daily loss, consistency rules, news windows. When a firm updates its terms, the change is detected, human-verified, and live in your guardrails before it can catch you out. Every ruleset shows when it was last verified, so you're never trading on stale rules." Visual: a compact mock card — "FundingPips · Daily loss: 5% → 4% · Verified today" with a teal check. Caption: "Available on the Funded plan." One band only — the page stays audience-neutral.
7. Community strip (just above the footer): "Questions? Join the VouchFX community on Telegram" with a ghost "Open Telegram" button linking to https://t.me/getvouchfx (new tab). Keep it understated — the free trial stays the primary CTA.
8. Footer with a "Join our Telegram" link (Telegram paper-plane icon, https://t.me/getvouchfx) and the disclaimer line: "VouchFX is an execution tool you control. It does not provide financial advice or guarantee outcomes. Trading involves risk."

Make it polished and conversion-focused. Mobile responsive.
```

---

## Prompt 2 — Onboarding wizard (the critical flow)

```
Using the VouchFX design language, build the VouchFX onboarding wizard as a single responsive React artifact. This is the most important UX to validate: a new user should feel they can finish in ~90 seconds.

A 5-step horizontal stepper at the top (with a progress bar). Clicking Next/Back moves between steps; track state in React. Steps:

Step 1 — Connect Telegram: Show a QR code mock and an alternative "Use phone number" form (phone + code fields). Explain in one line that VouchFX reads only the channels you're already in, read-only, never sends messages. After "Connect", show a connected state with a teal check.

Step 2 — Choose channels: Show a searchable list of ~8 mock Telegram channels the user belongs to (e.g. "Gold Sniper VIP", "FX Pips Pro", "Scalp Kings", "London Session Signals") each with member counts and a toggle. Some on, some off. A running count: "3 channels selected".

Step 3 — Connect broker: A form for MT5 — Broker (dropdown: Exness, HFM, FXTM, Deriv, Other), Server, Login, Password. A helper note recommending an investor/trade password (no withdrawal rights). A "Validate connection" button that shows a spinner then a success card with mock balance ($1,240.50) and equity.

Step 4 — Set your risk: Controls for Execution Mode (segmented control: "Mirror provider exactly" vs "Apply my risk rules", default Apply-my-rules — when Mirror is selected, reveal a lot-size sub-choice: provider's stated lot / fixed lot / risk-based, plus an "Allow trades with no stop loss" acknowledgement checkbox), Risk per trade (slider/stepper, default 0.5%), Max trades per day (default 5), Daily signal limit (default 5), Default SL policy (radio: apply default SL / skip signal), News filter (toggle). Keep it clean.

Step 5 — Go live: A summary card recapping channels, broker, and risk. A radio choice: "Go live now" vs "Demo-first for 7 days". A required checkbox: "I understand VouchFX executes signals I choose and does not provide financial advice." A teal "Finish & go live" button (disabled until the box is checked).

Polished, mobile responsive, with smooth step transitions.
```

---

## Prompt 3 — Main dashboard

```
Using the VouchFX design language, build the VouchFX main dashboard as a single responsive React artifact.

Layout: a left sidebar (Dashboard, Channels, Signals, Risk, Billing, Refer & earn, Settings) that collapses to a bottom nav on mobile. Top bar with the VouchFX wordmark, a broker connection status pill (teal "Exness — Connected"), and a Telegram status pill.

Main content:
- A row of stat cards: Account balance ($1,240.50), Equity ($1,318.70), Today's P&L (+$78.20 in green), Open trades (3), Signals today (4 of 5 — showing the daily signal limit).
- An "Open positions" table: columns Symbol, Side, Lots, Entry, Current, SL, TP, P&L, Channel, and a per-row close button. ~3 rows with realistic data (XAUUSD BUY +$84.20, EURUSD SELL -$12.10, GBPJPY BUY +$6.10). Use monospace tabular numbers; color P&L green/red.
- A "Recent activity" feed (right column or below): timeline of events like "Signal executed — XAUUSD BUY from Gold Sniper VIP", "SL moved to breakeven — EURUSD", "Signal skipped — no SL detected", each with a timestamp and a small status icon. Make rows clickable (they'd open the signal detail).
- A subtle banner area for connection warnings (show one dismissed/healthy by default, but include the disconnected-state styling).

Include a small equity sparkline using recharts. Mobile responsive.
```

---

## Prompt 4 — Signal detail / audit log (the transparency differentiator)

```
Using the VouchFX design language, build the VouchFX "Signal detail" view as a single responsive React artifact. This screen is VouchFX's key differentiator — full transparency on exactly what happened and why.

Top: a header with the channel name ("Gold Sniper VIP"), timestamp, symbol XAUUSD, and a status pill ("Executed").

Then a vertical, sectioned breakdown (like an audit trail), each section a card:
1. Original message: render a realistic Telegram signal message bubble, e.g. "🟢 GOLD BUY NOW 3000-3010\nSL 2980\nTP1 3030\nTP2 3050\nTP3 3080". Include an option/tab to show an "image signal" variant (a placeholder screenshot block) to demonstrate vision parsing.
2. Parsed by VouchFX: show the structured fields extracted — Symbol, Side, Order type, Entry range, SL, TP1/TP2/TP3 — plus a confidence meter (e.g. 0.97) and the AI model used ("Claude Haiku 4.5").
3. VouchFX's reasoning: a plain-English explanation, e.g. "Detected a market buy on gold with an entry range and three take-profit levels. Stop loss present. Confidence high. Risk check passed: within 0.5% per-trade limit and under the daily signal limit (4 of 5)."
4. Validation & risk checks: a checklist (SL present ✓, symbol available on broker ✓, daily signal limit ✓, news window clear ✓).
5. Action sent to broker: the order ticket VouchFX placed — XAUUSD, BUY, 0.12 lots, split across TPs (e.g. 0.04 / 0.04 / 0.04), with SL/TP prices. Show the broker's response ("Order #80451123 filled at 3001.20").
6. Live outcome: current P&L (+$84.20 green), and a small event timeline (Opened → TP1 hit → SL to breakeven).

Add a tab/toggle at the very top to switch between an "Executed" example and a "Skipped" example (the skipped one shows reason: "No stop loss detected — your policy is set to skip"). Mobile responsive.
```

---

## Prompt 5 — Channels management

```
Using the VouchFX design language, build the VouchFX "Channels" management screen as a single responsive React artifact.

A list/grid of the Telegram channels the user is copying. Each channel is a card or row showing:
- Channel name + member count + a small avatar/initial.
- A master on/off toggle (copying enabled).
- Status: "Live", "Demo-first (4 days left)", or "Paused".
- Key per-channel settings shown inline or in an expandable panel: Risk override (% or "uses global"), Daily signal limit override (e.g. "3 / day" or "uses global"), Default SL policy.
- A signals-today counter (e.g. "2 of 3 today").
- A red "Kill switch" action (pause channel) with a choice when triggered: "Pause & keep trades open" vs "Pause & close all".

Include an "Add channel" affordance and an empty-state design. Make at least one channel expanded to show the per-channel override controls (risk slider, daily signal limit stepper, SL policy radio, reverse-trade toggle). Mobile responsive — rows collapse cleanly.
```

---

## Prompt 6 — Risk settings

```
Using the VouchFX design language, build the VouchFX global "Risk settings" screen as a single responsive React artifact.

Group the controls into clean sections:
1. Execution Mode: a segmented control — "Mirror provider exactly" vs "Apply my risk rules" (default Apply-my-rules). Helper: "Mirror places the provider's SL/TP exactly as posted; Apply uses your own risk rules." When Mirror is selected, reveal: lot-size sub-choice (provider's stated lot / fixed lot / risk-based) and an "Allow trades with no stop loss — I understand the risk" checkbox (off by default). Note that daily limits and the loss cap still apply in both modes.
2. Position sizing: Risk mode (radio: % of balance / fixed lot / fixed $ risk), Risk per trade (default 0.5%), with a live worked example ("On $1,240 balance at 0.5%, a 20-pip SL ≈ 0.31 lots"). (Used in Apply-my-rules mode and as the risk-based mirror lot option.)
3. Daily limits: Max trades per day (stepper, default 5), Daily signal limit (stepper, default 5) with helper text "VouchFX will act on at most this many signals per day, then skip the rest", Day rollover time (dropdown, default 00:00 broker time).
4. Drawdown protection: Max daily loss (% or $) → on breach: Pause copying (+ optional Close all open trades). Show this as a prominent safety card.
5. Stop-loss handling: When a signal has no SL — radio: Apply default SL (with a pips input) / Skip the signal / Ask me. (Applies in Apply-my-rules mode; Mirror mode uses the no-SL acknowledgement above.)
6. Trade management: Breakeven after TP1 (toggle), Trailing stop after TP2 (toggle).
7. News filter: toggle + minutes-before/after high-impact news.

Every control has sensible defaults pre-filled and a short helper line. A sticky "Save changes" bar at the bottom. Mobile responsive.
```

---

## Prompt 7 — Billing & plans

```
Using the VouchFX design language, build the VouchFX "Billing & plans" screen as a single responsive React artifact.

Top: current plan card — "Free trial — 5 days left, 1 signal/day" with a teal "Upgrade" CTA and a usage note.

Plan selection: 4 cards — Starter $19/mo, Pro $39/mo (badge "Most popular"), Funded $79/mo, Lifetime $399 one-off. Each lists: broker accounts (1 / 3 / 10 / 3), signals per day (1 on trial vs unlimited on paid), prop-firm features (Pro+), priority/failover (Funded), and the current plan marked. Monthly billing only (no annual toggle).

Payment method section: two options presented clearly — "Pay with card (USD)" via Stripe and "Pay in naira" via Paystack — as selectable cards. Show a mock checkout summary panel (selected plan, price, "billed monthly", a teal "Confirm & subscribe" button).

Below: a simple invoice history table (date, plan, amount, status) with 2–3 mock rows. Mobile responsive.
```

---

## Prompt 7b — Refer & earn (affiliate + user referral)

```
Using the VouchFX design language, build the VouchFX "Refer & earn" screen as a single responsive React artifact. It serves two audiences via a tab switch at the top: "Signal providers" (affiliate) and "My referrals" (user referral). Both pay 20%.

Shared top: the user's unique referral link in a copy-able field with a "Copy" button, a "Copy Telegram message" button (copies a ready-made invite), and a small QR code block.

Tab 1 — Signal providers (affiliate):
- Headline: "Earn 20% recurring for every trader you refer."
- A row of earning stat cards: Clicks (1,840), Signups (96), Active referrals (61), This month's earnings ($212.40, green), Pending ($88.10), Lifetime paid ($1,470.00).
- A referrals table: Referred user (masked, e.g. "tund***@gmail.com"), Plan (Pro/Starter/Funded), Status (Trial / Active / Churned with pills), Monthly commission, Joined date. ~6 rows.
- A payout panel: balance vs $50 minimum threshold, payout method selector (Paystack NGN / Bank / Wise / Crypto), next payout date, and a "Request payout" button (disabled below threshold). A small note: "Commission is 20% of collected subscription payments; trials don't earn until they convert; refunds are clawed back."

Tab 2 — My referrals (user):
- Headline: "Give 20% off, get 20% credit."
- Explainer: friends you refer get 20% off their first month; you get 20% recurring as account credit toward your own subscription.
- Cards: Friends invited (4), Friends subscribed (2), Account credit earned ($7.60, applied to next invoice).
- A simple list of invited friends with status pills.

Use realistic mock data, monospace tabular numbers, green only for earnings/positive figures, amber for "Trial/Pending", red only for "Churned". Mobile responsive.
```

---

## Prompt 8 — Master clickable prototype (for client demo)

```
Using the VouchFX design language, build a single navigable React artifact that stitches the core VouchFX app into one clickable prototype for a demo. Include a persistent left sidebar (collapsing to a bottom nav on mobile) that switches between these in-app views using React state (no routing library):

1. Dashboard — stat cards (balance, equity, today's P&L, open trades, "Signals today 4 of 5"), an open-positions table with realistic forex rows and green/red P&L, a recent-activity feed, and an equity sparkline (recharts).
2. Channels — list of copied Telegram channels with on/off toggles, status (Live / Demo-first / Paused), per-channel daily signal limit, and a kill switch.
3. Signal detail — opened by clicking any activity-feed row or position: shows original Telegram message → parsed fields + confidence + model → plain-English reasoning → risk checks → order sent to broker → live P&L. Include a toggle between an "Executed" and a "Skipped (no SL detected)" example.
4. Risk — global risk settings: risk per trade, max trades/day, daily signal limit, daily loss cap, default-SL policy, breakeven/trailing, news filter.
5. Billing — the 4 plan cards (Starter/Pro/Funded/Lifetime) with USD (Stripe) and naira (Paystack) options.
6. Refer & earn — two tabs (Signal providers / My referrals), both at 20%: a copy-able referral link + QR, earning stat cards, a referrals table with status pills, and a payout panel with a $50 minimum threshold.
7. Prop Mode — a per-account prop-firm view: a firm/challenge selector (e.g. "FundingPips 100K 2-step"), live rule cards (daily loss, max/trailing drawdown, consistency %, news window) each showing usage vs limit with a status pill, a prominent equity-guardian gauge, and a consistency meter showing profit distribution. (Phase 2 feature — include it in the demo as a forward-looking screen.)

Use realistic mock data throughout (XAUUSD, EURUSD, GBPJPY; Exness/HFM; lots like 0.12). Keep all numbers in monospace tabular figures and reserve green/red strictly for P&L and connection status. Make the whole thing polished, cohesive, and fully responsive — this is what I'll show a client.
```

---

## Prompt 9 — Prop Mode (prop-firm rule engine)

```
Using the VouchFX design language, build the VouchFX "Prop Mode" screen as a single responsive React artifact. This is the prop-firm-native control room — it shows VouchFX enforcing a prop firm's full ruleset on a funded account in real time. Framing is protection, not evasion.

Top: a per-account selector — Account (dropdown: "FundingPips 100K — Account #1", "FTMO 50K — Account #2") and the loaded firm preset with a small "Rules last verified: 2 days ago" note and a teal "Prop Mode: ON" pill.

Rule status cards (grid) — each card = one rule with current usage vs limit, a progress bar, and a status pill (teal OK / amber Caution / red Breach-risk):
- Daily loss: used $312 of $5,000 limit (equity-based) — show a live "equity guardian" emphasis.
- Max drawdown: $1,180 of $10,000, model "EOD trailing", current floor shown.
- Consistency: best day is 28% of total profit vs 30% cap — amber "Caution", with a one-line "throttling today's copying to protect your payout".
- News window: "Flat 2 min before/after high-impact" — next event in 41 min, with an auto-flatten note.
- Weekend holding: "Not allowed — auto-close Friday 20:45" .
- Min trading days: "4 of 5 days met".

A prominent Equity Guardian panel: a gauge/bar of current equity vs the intraday daily-loss floor, with the live distance, and the message "VouchFX will block or close trades before this floor is hit."

A Consistency meter: a horizontal bar of daily profit contributions across the evaluation, highlighting the biggest day against the 30% cap.

Stealth execution: a small settings strip — toggles/sliders for randomised lot variation, micro-delay, SL/TP jitter, neutral comments — labelled "Avoid copy-group detection across accounts."

A subtle banner if the selected firm restricts copying: amber "This firm restricts copy trading — review their terms before enabling." (show it as a dismissible example).

Use realistic mock data, monospace tabular numbers, green/red reserved for P&L and breach status, amber for caution. Mobile responsive.
```

---

## Prompt 10 — Rule Monitor approval queue (admin)

```
Using the VouchFX design language, build the VouchFX "Rule Monitor" admin screen as a single responsive React artifact. This is an internal/ops screen where a rule approver reviews prop-firm rule changes detected by an AI agent before they go live. Audience: an assigned approver (a fillable role), not end users.

Top: a header "Rule Monitor" with a status line ("Agent last ran: today 06:00 · 14 firms monitored · 3 changes pending") and a small "Approver" badge.

Main: a pending-changes queue — each item a card showing:
- Firm + challenge (e.g. "FundingPips — 100K 2-step").
- The diff, old → new, with the changed field highlighted (e.g. "Daily loss: 5% → 4%").
- A stakes tag: red "Account-killing — approval required" (daily loss / drawdown / consistency) vs neutral "Low-stakes" (e.g. news window minutes).
- Source link, detected date, and an agent-confidence pill (High / Medium / Low).
- Actions: teal "Approve", ghost "Reject", ghost "Edit value".
Include 3 mock items: one account-killing high-confidence (FundingPips daily loss 5% → 4%), one low-stakes item shown as already auto-published with an "Undo/rollback" link (The5ers news window 2 → 3 min), and one low-confidence flagged item needing manual entry (FXIFY — "source unclear, manual review needed").

Below: a "Version history" table for a selected firm: version, change summary, published by (Agent auto / Approver name), date, source link, and a "Rollback" action per row.

A footer note: "Only firms that explicitly permit copy trading are supported."

Use the design language exactly: dark, teal actions, amber for caution/pending, red ONLY for the account-killing stakes tag, monospace for values. Mobile responsive.
```

---

## Iteration tips

- If an artifact gets too large or slow, ask Claude to "split this into smaller components" or build screens individually (Prompts 1–9) instead of the master (Prompt 8).
- To refine the look: "tighten the spacing", "make the cards feel more like a trading terminal", "show the disconnected-broker banner state", "add an empty state".
- To validate flows with the client: build Prompt 8, then ask "add a fake 'simulate incoming signal' button on the dashboard that animates a new trade appearing" — great for live demos.
- Keep the Design Brief (Prompt 0) pinned; re-paste it whenever you start a fresh chat so the visual language stays consistent.

---

*Next in the documentation-first flow after prototype sign-off: CLAUDE.md + SKILL.md, then the Phase 0 → Phase 1 build-prompt sequence for Claude Code.*
