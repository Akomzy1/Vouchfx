# SKILL: signal-parsing

**Repo location:** `.claude/skills/signal-parsing/SKILL.md`
**Owns:** turning a raw Telegram message (text or image, any language/format) into a validated structured signal, plus classifying follow-up messages (modify / close / cancel).

## Why this is LLM-based, not regex
Signal providers use endless formats — emojis, ranges ("BUY 3000-3010"), pip- or %-based SL/TP, multi-line layouts, screenshots, multiple languages, and follow-up edits ("close half", "cancel that", message deletions). Template/regex parsing breaks on every new channel. An LLM with structured output generalises with zero per-channel config. This is the single most important quality lever in the product.

## Model routing
1. Try `claude-haiku-4-5-20251001` (text-only, fast, cheap).
2. Escalate to `claude-sonnet-4-6` if: Haiku `confidence < 0.85`, OR the message has an image, OR it's a follow-up needing prior-signal context.
3. Escalate to `claude-opus-4-8` only for: the first N (default 5) signals of a newly added channel ("learning pass"), or human-flagged ambiguous cases.
- Always use **prompt caching** for the system prompt + emoji/abbreviation glossary + the user's broker symbol map.
- Always use **tool-use / JSON-schema structured output** — never free-text-then-parse.

## Output schema (the tool input schema)
```json
{
  "is_signal": true,
  "symbol": "XAUUSD",
  "side": "buy | sell",
  "order_type": "market | limit | stop",
  "entries": [3000.0, 3010.0],
  "sl": 2980.0,
  "sl_unit": "price | pips | percent",
  "tps": [3030.0, 3050.0, 3080.0],
  "tp_unit": "price | pips | percent",
  "confidence": 0.0,
  "reasoning": "plain-English explanation of the parse",
  "follow_up_type": "NEW_SIGNAL | MODIFY_SL | MODIFY_TP | MOVE_TO_BE | CLOSE_PARTIAL | CLOSE_ALL | CANCEL_PENDING | IGNORE",
  "references_prior_trade": true,
  "language_detected": "en"
}
```

## Parsing rules
- If the message is chatter/analysis/no actionable trade → `is_signal: false`, `follow_up_type: IGNORE`. Do not invent fields.
- Entry ranges → populate `entries` with both bounds; the executor decides fill behaviour.
- Convert nothing yourself when unit is pips/percent — return the unit and let the risk/execution layer resolve against live price and the broker's pip size.
- Missing SL is allowed in the parse output (set `sl: null`) — the **risk engine** applies the user's default-SL policy (apply default / skip / ask). Parsing does not decide execution.
- Always populate `reasoning` — it is shown to the user verbatim in the audit log.
- `confidence` reflects extraction certainty, not trade quality. Never editorialise on whether the trade is "good".

## Follow-up & cancel classification (critical)
A message in a channel that already has a related VouchFX-managed order/position must be classified with the prior signal as context:
- "SL to BE", "move stop to entry" → `MOVE_TO_BE`
- "change SL to X", "new stop X" → `MODIFY_SL`
- "TP now X", "add TP" → `MODIFY_TP`
- "close half", "take partial", "secure 50%" → `CLOSE_PARTIAL`
- "close now", "exit", "out", "close all" → `CLOSE_ALL`
- "cancel", "delete that order", "no longer valid", "scrap it", "ignore previous" → `CANCEL_PENDING` **if the order is still pending/unfilled**; if it has filled, this maps to `CLOSE_ALL` (the executor resolves which, based on order state).
- A **Telegram message deletion or edit** of a prior signal is delivered as a synthetic event and classified as `CANCEL_PENDING` (the listener tags it; see telegram-ingestion skill). The executor cancels the pending order if unfilled, else flags per the user's close policy.

Always set `references_prior_trade: true` for follow-ups so the executor can match to the right trade by channel + symbol + originating signal.

## Validation before handing to execution
The parser output is validated (zod) and then the risk engine gates it. Parsing must never call the broker directly.

## Testing
Maintain a corpus of ≥50 real-world signal formats (text + image + follow-ups + cancels + multilingual) with expected structured output. Field-level accuracy target ≥98%. Add every misparse from production to the corpus as a regression case.
