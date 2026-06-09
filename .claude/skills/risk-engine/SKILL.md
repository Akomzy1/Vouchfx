# SKILL: risk-engine

**Repo location:** `.claude/skills/risk-engine/SKILL.md`
**Owns:** the deterministic gate between a parsed signal and execution — sizing the position and enforcing every limit. Pure logic in `packages/core`, no I/O.

## Execution Mode (Mirror vs Apply-my-rules)
Before sizing/gating, read the user's Execution Mode (global, overridable per channel):

- **Apply my risk rules** (default): run the full sizing + gate below as normal.
- **Mirror provider exactly**: place the provider's SL and TP prices **unchanged**; do **not** substitute a default SL, and do **not** apply breakeven/trailing unless the user explicitly opted in. Lot size still comes from the user's mirror lot sub-choice: provider's stated lot (if present) → else fixed lot → else risk-based.
  - If the signal has **no SL**: only execute if the user's explicit "allow no stop loss" acknowledgement is on; otherwise skip-with-reason. Never silently place a no-SL trade.
  - **Hard caps still apply** in Mirror mode: daily signal limit (gate step 4), max trades/day (step 5), and daily loss cap / drawdown guardian (step 6) are enforced regardless of mode. They are account-safety guardrails, not signal adjustments. (Steps 2 default-SL-substitution and the news filter are skipped/optional in Mirror mode.)

## Position sizing
Three modes (user-selected): `% of balance` (default 0.5%), `fixed lot`, `fixed $ risk`.
- For % and $ risk: lot = risk amount ÷ (SL distance in price × contract value per price unit for the resolved symbol). Use the broker's symbol contract spec (pip/point size, contract size) — fetch via the executor, don't hardcode.
- Round to the broker's volume step; enforce min/max volume.
- If SL is in pips/percent, resolve to a price distance against the entry (or live price for market orders) before sizing.

## The gate (run in this order; first failure → skip-with-reason)
1. **Is signal & confidence**: `is_signal` true and `confidence ≥ threshold` (default 0.85), else skip.
2. **SL policy**: if `sl` is null → apply the user's default-SL policy: `apply default` (use their default-SL pips), `skip` (skip-with-reason), or `ask` (hold + notify, do not execute).
3. **Symbol available** on the user's broker (executor `resolveSymbol` returns non-null), else skip.
4. **Daily signal limit** (global, and per-channel override): count signals **acted on** today (not parsed); if at the cap → skip-with-reason "daily signal limit reached". Counter resets at the user's day-rollover time.
5. **Max trades/day**: if reached → skip.
6. **Daily loss cap / drawdown guardian**: if today's realised+floating loss ≥ cap → pause copying for the account (and optionally close-all per user setting); skip and notify.
7. **News filter** (if enabled): if within the configured window around a high-impact event for the symbol's currencies → skip-with-reason.
8. Passed → compute volume, build the `OrderRequest`, hand to executor.

## Daily signal limit vs max trades/day (don't conflate)
- **Daily signal limit** = how many *signals* VouchFX acts on per day (user-set; also the free-trial cap of 1/day, system-locked). Counts acted-on signals.
- **Max trades/day** = how many *orders/positions* get placed per day. A single multi-TP signal may create multiple legs but counts as **one** signal and may count as multiple trades — define and document which; default: 1 signal = 1 toward signal limit, each leg = 1 toward trade count.

## Trade management (post-fill, user toggles)
- Breakeven after TP1: on TP1 fill, `MOVE_TO_BE`.
- Trailing stop after TP2: trail SL by the configured distance.
These are executed via the executor; the risk engine decides *whether/when*, the executor performs the broker action.

## Determinism & audit
- The risk engine is pure and fully unit-tested — it decides money outcomes. Every decision (executed or skipped, with the reason and the inputs) is written to `audit_events`.
- Never let an AI model make the final execution decision. The model parses; deterministic code gates and sizes.
