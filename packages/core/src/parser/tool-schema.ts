import type Anthropic from "@anthropic-ai/sdk";

/**
 * Tool definition for parse_signal.
 *
 * The input_schema mirrors ParsedSignalSchema exactly. All fields are in
 * `required` so the model always returns them — nullable fields use
 * anyOf [{type}, {type: "null"}] to allow null but not omission.
 *
 * This object is passed with cache_control: ephemeral alongside the system
 * prompt so the tool definition is cached server-side after the first call.
 */
export const PARSE_SIGNAL_TOOL: Anthropic.Tool & {
  cache_control: Anthropic.CacheControlEphemeral;
} = {
  name: "parse_signal",
  description:
    "Parse a raw Telegram trading signal message into structured fields. Always call this tool — never respond with free text.",
  cache_control: { type: "ephemeral" },
  input_schema: {
    type: "object" as const,
    required: [
      "is_signal",
      "symbol",
      "side",
      "order_type",
      "entries",
      "sl",
      "sl_unit",
      "tps",
      "tp_unit",
      "confidence",
      "reasoning",
      "follow_up_type",
      "references_prior_trade",
      "references_prior_message_id",
      "language_detected",
    ],
    properties: {
      is_signal: {
        type: "boolean",
        description: "True if the message contains an actionable trade instruction.",
      },
      symbol: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description: "Standard broker symbol (e.g. XAUUSD, EURUSD, US100). null if not determinable.",
      },
      side: {
        anyOf: [{ type: "string", enum: ["BUY", "SELL"] }, { type: "null" }],
        description: "Trade direction. null if not determinable.",
      },
      order_type: {
        anyOf: [
          { type: "string", enum: ["MARKET", "LIMIT", "STOP"] },
          { type: "null" },
        ],
        description: "Order type. null if not determinable.",
      },
      entries: {
        type: "array",
        items: { type: "number" },
        description:
          "Entry prices. Range signals produce two bounds [low, high]. Empty array if no entry stated.",
      },
      sl: {
        anyOf: [{ type: "number" }, { type: "null" }],
        description: "Stop loss value in sl_unit. null if no SL stated.",
      },
      sl_unit: {
        anyOf: [
          { type: "string", enum: ["price", "pips", "percent"] },
          { type: "null" },
        ],
        description: "Unit for sl. null when sl is null.",
      },
      tps: {
        type: "array",
        items: { type: "number" },
        description: "Take profit values in tp_unit, ordered TP1 → TP2 → TP3 etc. Empty array if none stated.",
      },
      tp_unit: {
        anyOf: [
          { type: "string", enum: ["price", "pips", "percent"] },
          { type: "null" },
        ],
        description: "Unit for all tps. null when tps is empty.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Extraction certainty 0–1. Reflects parse quality, NOT trade quality.",
      },
      reasoning: {
        type: "string",
        description:
          "Plain-English explanation shown verbatim to the user in the audit log. 1–3 sentences, factual, no trade-quality opinion.",
      },
      follow_up_type: {
        anyOf: [
          {
            type: "string",
            enum: [
              "NEW_SIGNAL",
              "MODIFY_SL",
              "MODIFY_TP",
              "MOVE_TO_BE",
              "CLOSE_PARTIAL",
              "CLOSE_ALL",
              "CANCEL_PENDING",
              "IGNORE",
            ],
          },
          { type: "null" },
        ],
        description:
          "NEW_SIGNAL for fresh trades; follow-up type if modifying/closing a prior trade; IGNORE for non-signals.",
      },
      references_prior_trade: {
        type: "boolean",
        description: "True when this message modifies or cancels a prior signal in this channel.",
      },
      references_prior_message_id: {
        anyOf: [{ type: "integer" }, { type: "null" }],
        description: "Telegram message id of the original signal being modified/cancelled, if stated.",
      },
      language_detected: {
        type: "string",
        description: "ISO 639-1 language code of the message (e.g. en, ar, pt).",
      },
    },
  },
};
