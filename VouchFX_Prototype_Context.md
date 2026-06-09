# VouchFX — Prototype Context & Design System

**What this is:** A single reference document to attach to a claude.ai chat when generating VouchFX prototype screens. With this attached, your prompts can be short (e.g. "build the dashboard") and every screen will come out visually consistent and on-brand.

**How to use:** Attach this file to the chat. Optionally open with: *"Use the attached VouchFX context for everything you build. Confirm you've read it, then wait for the screen I ask for."* Then request screens one at a time.

**Scope:** These are **design/UX prototypes** — mocked data, no real integrations, no backend logic.

---

## 1. Product in one paragraph

VouchFX automatically copies trading signals posted in Telegram channels onto a trader's MetaTrader 5 (MT5) account. The trader connects their Telegram (read-only, to read channels they already belong to) and their MT5 broker, then sets risk rules. VouchFX uses AI to parse each incoming signal — text or screenshot, any format or language — into structured fields (symbol, side, entry, stop loss, take-profits), validates it against the trader's risk settings, and places/modifies/closes the trade automatically. It is **an execution tool the trader controls** — not financial advice, not a managed account, not a signal marketplace. Brand values: **trustworthy, fast, transparent.**

---

## 2. Who it's for

| Persona | One-line need |
|---|---|
| Busy subscriber | Has a job, pays for 1–3 VIP channels, can't watch charts — never miss a signal |
| Multi-channel trader | Follows 4–8 channels — per-channel control and limits |
| Prop-firm trader | On a funded account — drawdown protection, stealth execution, daily caps |
| Nigerian retail trader | Uses HFM/Exness/Deriv, mobile-first, price-sensitive — naira checkout |

Mobile-first matters: assume many users are on phones.

---

## 3. Core concepts & glossary (use this terminology exactly)

- **Signal** — a trade instruction posted in a Telegram channel (e.g. "GOLD BUY 3000, SL 2980, TP 3030").
- **Channel / source** — a Telegram channel or group the trader copies signals from.
- **Parse** — AI converting a raw signal (text or image) into structured fields + a confidence score + plain-English reasoning.
- **Execution** — placing the trade on the broker via the (invisible-to-user) execution layer.
- **Audit log / signal detail** — the transparent record of a signal: raw message → parsed fields → reasoning → risk checks → broker action → live P&L. **This is VouchFX's key differentiator.**
- **Daily signal limit** — a trader-set cap on how many signals VouchFX acts on per day (global and per-channel). After the cap, further signals are skipped with reason.
- **Demo-first mode** — running a new channel on a paper account for N days before going live.
- **Kill switch** — instantly pause a channel (with a choice: keep trades open vs close all).
- **Default-SL policy** — what to do when a signal has no stop loss: apply a default SL / skip the signal / ask.
- **Execution Mode** — per-user/per-channel choice: "Mirror provider exactly" (place the provider's SL/TP unchanged; lot via provider's-stated/fixed/risk-based; no auto-adjustments; no-SL requires explicit opt-in) vs "Apply my risk rules" (the risk engine sizes and manages). Hard caps (daily signal limit, max trades/day, daily loss cap) apply in both.
- **Drawdown guardian** — pause copying (and optionally close all) when a daily-loss cap is hit.
- **Stealth execution** — randomised delay + neutral order comment, for prop-firm compatibility.
- **Provider affiliate** — a signal-channel owner who refers their subscribers via a link and earns 20% recurring commission. VouchFX pays for referrals only; it does not rank or vouch for providers.
- **User referral** — a trader referring a friend: the friend gets 20% off their first month, the referrer gets 20% recurring as account credit.
- **Prop Mode** — VouchFX enforcing a selected prop firm's full ruleset per account in real time (Phase 2). Framing is protection, not evasion.
- **Consistency rule** — a prop-firm cap on how much of total profit may come from one day (typically 20–50%); can lock a payout even when all other rules pass.
- **Equity guardian** — VouchFX watching equity tick-by-tick to block/flatten before an equity-based intraday loss limit is hit.
- **Trailing drawdown** — a max-loss floor that moves with profit; static / EOD-trailing / intraday-trailing models behave differently.

Never use: "investment advice", "guaranteed", "expected profit", "managed for you". VouchFX executes what the user chooses.

---

## 4. Design language ("the VouchFX design language")

**Aesthetic:** modern fintech, dark-first, clean and data-precise. Confident, not playful. A refined trading dashboard, not a consumer app.

**Color palette:**

| Token | Hex | Use |
|---|---|---|
| Background | `#0B0F14` | App background (near-black slate) |
| Surface | `#151B23` | Cards, panels |
| Surface elevated | `#1B232D` | Modals, popovers, raised panels |
| Border | `#222B36` | 1px borders, dividers |
| Primary / accent | `#14B8A6` | Buttons, links, active states, "connected/verified" (teal) |
| Text primary | `#E6EDF3` | Headings, key values |
| Text secondary | `#8B98A5` | Labels, secondary copy |
| Text muted | `#5B6772` | Hints, timestamps |
| Profit green | `#22C55E` | P&L gains, "connected" status only |
| Loss red | `#EF4444` | P&L losses, "disconnected"/error status only |
| Warning amber | `#F59E0B` | Warnings, "paused", "demo-first" status |

**Critical color rule:** green and red are **reserved strictly for money (P&L) and connection/status**. Never use green/red as a generic UI accent — the only action/brand color is teal.

**Typography:** clean geometric sans (Inter-style / system default). **All numbers — prices, lots, balances, P&L, pips — use a monospace font with tabular figures** so columns align.

**Components & layout:**
- Cards: `rounded-xl`, 1px border (`#222B36`), subtle — favor borders over heavy shadows.
- Status pills: small rounded-full chips with a dot + label (e.g. teal "Connected", amber "Paused", red "Disconnected").
- Data rows/tables: compact, monospace numbers, generous-but-efficient spacing.
- Buttons: teal primary (solid), ghost/secondary (border only), destructive (red, used sparingly).
- Toggles, sliders, steppers for settings.
- Iconography: **lucide-react**.
- Motion: subtle only (hover states, smooth step/tab transitions). No flashy animation.

**Responsiveness:** fully responsive, mobile-first. On mobile, the sidebar collapses to a bottom nav or hamburger; tables collapse into stacked rows/cards.

---

## 5. Reusable component patterns

- **Stat card:** small label (secondary), large monospace value (primary), optional delta in green/red. Used in dashboard top row.
- **Status pill:** dot + text; teal=connected/live, amber=paused/demo-first, red=disconnected/error.
- **Position row:** Symbol · Side · Lots · Entry · Current · SL · TP · P&L (green/red) · Channel · close action.
- **Signal card (Telegram bubble):** a chat-style message bubble rendering the raw signal text with emojis; an "image signal" variant shows a placeholder screenshot block.
- **Audit section:** stacked labeled cards forming a top-to-bottom trail (original → parsed → reasoning → checks → action → outcome).
- **Setting row:** label + helper line + control (toggle/slider/stepper/radio), with sensible default pre-filled.
- **Plan card:** name, price, feature list, "current"/"most popular" badge, CTA.
- **Connection banner:** full-width strip for broker/Telegram status warnings (show healthy by default; include disconnected styling).

---

## 6. Canonical mock data (reuse across ALL screens for consistency)

**Account / user**
- Name: Tunde A. · Plan: Pro · Broker: Exness (Connected) · Telegram: Connected
- Balance: `$1,240.50` · Equity: `$1,318.70` · Today's P&L: `+$78.20` · Open trades: `3`
- Signals today: `4 of 5` (daily signal limit = 5)

**Channels the user copies**
| Channel | Members | Status | Daily limit | Today |
|---|---|---|---|---|
| Gold Sniper VIP | 12,400 | Live | 3 / day | 2 of 3 |
| FX Pips Pro | 8,100 | Live | uses global (5) | 2 of 5 |
| Scalp Kings | 5,600 | Demo-first (4 days left) | 5 / day | 0 of 5 |
| London Session Signals | 3,200 | Paused | — | — |

**Open positions**
| Symbol | Side | Lots | Entry | Current | SL | TP | P&L | Channel |
|---|---|---|---|---|---|---|---|---|
| XAUUSD | BUY | 0.12 | 3001.20 | 3008.95 | 2980.00 | 3030/3050/3080 | `+$84.20` | Gold Sniper VIP |
| EURUSD | SELL | 0.20 | 1.0865 | 1.0871 | 1.0905 | 1.0820 | `-$12.10` | FX Pips Pro |
| GBPJPY | BUY | 0.08 | 198.40 | 198.48 | 197.90 | 199.20 | `+$6.10` | FX Pips Pro |

**Recent activity feed (newest first)**
- 09:42 — Signal executed — XAUUSD BUY from Gold Sniper VIP
- 09:30 — SL moved to breakeven — EURUSD
- 09:18 — Signal skipped — no SL detected (FX Pips Pro)
- 08:55 — Signal executed — GBPJPY BUY from FX Pips Pro
- 08:40 — TP1 hit — XAUUSD (+$28.00)

**Example signal — Executed (text)**
```
🟢 GOLD BUY NOW 3000-3010
SL 2980
TP1 3030
TP2 3050
TP3 3080
```
Parsed → Symbol XAUUSD · Side BUY · Type market · Entry 3000–3010 · SL 2980 · TP 3030/3050/3080 · Confidence 0.97 · Model "Claude Haiku 4.5".
Reasoning → "Market buy on gold with an entry range and three take-profits. Stop loss present. Risk check passed: within 0.5% per-trade limit and under the daily signal limit (4 of 5)."
Order sent → XAUUSD BUY 0.12 lots split 0.04/0.04/0.04 across TPs. Broker: "Order #80451123 filled at 3001.20."

**Example signal — Skipped**
```
GBPUSD buy 1.2650 tp 1.2700
```
Skipped → Reason: "No stop loss detected — your default-SL policy is set to Skip." Confidence 0.91.

**Plans (USD)**
| Plan | Price | Broker accounts | Signals/day | Notable |
|---|---|---|---|---|
| Free trial (7d) | $0 | 1 | 1 | All features, no card |
| Starter | $19/mo | 1 | Unlimited | Text + vision parsing, audit log |
| Pro (most popular) | $39/mo | 3 | Unlimited | Prop-firm features, priority region |
| Funded | $79/mo | 10 | Unlimited | Multi-region failover, priority support |
| Lifetime | $399 one-off | 3 | Unlimited | Pro features, lifetime updates |

Payment: USD via card (Stripe) or naira (Paystack).

**Referral & affiliate (both programs pay 20%)**
- User's referral link: `vouchfx.com/r/tunde` · referral code: `TUNDE`
- Provider affiliate stats: Clicks 1,840 · Signups 96 · Active referrals 61 · This month `+$212.40` · Pending `$88.10` · Lifetime paid `$1,470.00`
- Payout: balance `$88.10` vs `$50` minimum · method Paystack (NGN) · next payout 1st of month
- Sample referred users: `tund***@gmail.com` Pro Active `$7.80/mo`; `kemi***@yahoo.com` Starter Trial `$0.00`; `dare***@gmail.com` Funded Active `$15.80/mo`; `bola***@gmail.com` Pro Churned `—`
- User-referral side: Friends invited 4 · Subscribed 2 · Account credit earned `$7.60` (applied to next invoice)
- Rule strings: "Earn 20% recurring for every trader you refer." / "Give 20% off, get 20% credit." / "Trials don't earn until they convert; refunds are clawed back."

**Prop Mode (Phase 2 — per-account prop-firm rule engine)**
- Sample accounts: "FundingPips 100K — 2-step" (Account #1, Prop Mode ON), "FTMO 50K" (Account #2). Rules last verified: 2 days ago.
- Daily loss: used `$312` of `$5,000` (equity-based) · status OK
- Max drawdown: `$1,180` of `$10,000` · model EOD trailing · floor `$98,820`
- Consistency: best day `28%` of total profit vs `30%` cap · status Caution ("throttling today's copying to protect your payout")
- News window: flat 2 min before/after high-impact · next event in 41 min
- Weekend holding: not allowed · auto-close Friday 20:45
- Min trading days: 4 of 5 met
- Stealth params: lot variation ±, micro-delay, SL/TP jitter, neutral comments — "avoid copy-group detection across accounts"
- Restriction banner (example): "This firm restricts copy trading — review their terms before enabling." (amber)

---

## 7. Screen inventory

| Screen | Key contents |
|---|---|
| Landing page | Hero (signal → trade), trust strip, how-it-works (3 steps), feature grid, pricing, disclaimer |
| Onboarding wizard | 5 steps: Connect Telegram → Choose channels → Connect broker → Set risk → Go live |
| Dashboard | Stat cards, open-positions table, activity feed, equity sparkline, connection status |
| Signal detail / audit log | Raw message → parsed fields + confidence + model → reasoning → risk checks → broker action → live P&L; toggle Executed vs Skipped |
| Channels | List with on/off, status, per-channel daily limit, kill switch, per-channel overrides |
| Risk settings | Execution Mode (Mirror exactly / Apply my rules), position sizing, daily limits, drawdown guardian, default-SL policy, breakeven/trailing, news filter |
| Billing & plans | Plan cards, USD (Stripe) / naira (Paystack), checkout summary, invoice history |
| Refer & earn | Two tabs (Signal providers affiliate / My referrals), both 20%; referral link + QR, earning stats, referrals table, payout panel ($50 min) |
| Prop Mode (Phase 2) | Per-account firm selector + loaded ruleset; live rule cards (daily loss, drawdown+model, consistency %, news, weekend, min-days) with usage vs limit; equity-guardian gauge; consistency meter; stealth settings; copy-restriction warning |

App navigation: left sidebar (Dashboard, Channels, Signals, Risk, Billing, Refer & earn, Settings; plus Prop Mode for Phase 2) → collapses to bottom nav on mobile. Top bar shows the VouchFX wordmark (teal dot + "VouchFX") and broker/Telegram status pills.

---

## 8. Technical constraints for artifacts

- Single-file **React** component, **default export**.
- **Tailwind** utility classes only (no custom CSS build); **lucide-react** for icons; **recharts** only if a chart is needed.
- **No backend, no real API calls, no routing library** — use React state for navigation and the canonical mock data above.
- **No localStorage/sessionStorage** (not supported in artifacts) — keep state in React memory.
- Fully responsive, mobile-first.
- Keep components reasonably sized; if a screen gets too big, split into sub-components within the file.

---

## 9. Brand voice & copy

- Clear, confident, plain-spoken. Short labels. No hype.
- Lead with control and transparency: "signals you choose", "see exactly what happened and why".
- Always include the disclaimer where relevant: *"VouchFX is an execution tool you control. It does not provide financial advice or guarantee outcomes. Trading involves risk."*

---

## 10. Guardrails (do / don't)

**Do:** dark-first; teal as the only brand/action accent; monospace tabular numbers; reserve green/red for P&L and connection status; realistic forex data from §6; mobile responsive; show empty and disconnected states where relevant.

**Don't:** use green/red as decorative accents; invent different mock data per screen (use the canonical set); imply advice, guarantees, or managed accounts; add real integrations or backend logic; use heavy shadows or flashy animation.

---

*Companion docs: VouchFX PRD v1.0 (requirements) and VouchFX Prototype Prompt Pack v1.0 (the screen prompts). Attach this context doc to claude.ai, then use the screen prompts — they'll be shorter and more consistent with this attached.*
