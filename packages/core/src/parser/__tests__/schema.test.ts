import { describe, it, expect } from "vitest";
import { ParsedSignalSchema } from "../../types/signal";

// ── Valid signal ───────────────────────────────────────────────────────────────

const VALID_SIGNAL = {
  is_signal: true,
  symbol: "XAUUSD",
  side: "BUY" as const,
  order_type: "MARKET" as const,
  entries: [2350.50],
  sl: 2340.00,
  sl_unit: "price" as const,
  tps: [2360.00, 2370.00, 2385.00],
  tp_unit: "price" as const,
  confidence: 0.92,
  reasoning: "Clear BUY signal with entry, SL, and three TPs.",
  follow_up_type: "NEW_SIGNAL" as const,
  references_prior_trade: false,
  references_prior_message_id: null,
  language_detected: "en",
};

describe("ParsedSignalSchema — valid inputs", () => {
  it("accepts a fully-specified BUY signal", () => {
    const result = ParsedSignalSchema.safeParse(VALID_SIGNAL);
    expect(result.success).toBe(true);
  });

  it("accepts a non-signal (IGNORE)", () => {
    const result = ParsedSignalSchema.safeParse({
      ...VALID_SIGNAL,
      is_signal: false,
      symbol: null,
      side: null,
      order_type: null,
      entries: [],
      sl: null,
      sl_unit: null,
      tps: [],
      tp_unit: null,
      confidence: 0.1,
      follow_up_type: "IGNORE",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a follow-up with CLOSE_ALL", () => {
    const result = ParsedSignalSchema.safeParse({
      ...VALID_SIGNAL,
      is_signal: false,
      follow_up_type: "CLOSE_ALL",
      references_prior_trade: true,
      references_prior_message_id: 12345,
    });
    expect(result.success).toBe(true);
  });

  it("defaults entries and tps to [] when omitted", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { entries, tps, ...rest } = VALID_SIGNAL;
    const result = ParsedSignalSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entries).toEqual([]);
      expect(result.data.tps).toEqual([]);
    }
  });

  it("defaults language_detected to 'en' when omitted", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { language_detected, ...rest } = VALID_SIGNAL;
    const result = ParsedSignalSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language_detected).toBe("en");
    }
  });
});

describe("ParsedSignalSchema — validation rejects", () => {
  it("rejects confidence > 1", () => {
    const result = ParsedSignalSchema.safeParse({ ...VALID_SIGNAL, confidence: 1.1 });
    expect(result.success).toBe(false);
  });

  it("rejects confidence < 0", () => {
    const result = ParsedSignalSchema.safeParse({ ...VALID_SIGNAL, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid side", () => {
    const result = ParsedSignalSchema.safeParse({ ...VALID_SIGNAL, side: "LONG" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid order_type", () => {
    const result = ParsedSignalSchema.safeParse({ ...VALID_SIGNAL, order_type: "OCO" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid follow_up_type", () => {
    const result = ParsedSignalSchema.safeParse({ ...VALID_SIGNAL, follow_up_type: "HEDGE" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sl_unit", () => {
    const result = ParsedSignalSchema.safeParse({ ...VALID_SIGNAL, sl_unit: "ticks" });
    expect(result.success).toBe(false);
  });

  it("rejects missing required field (reasoning)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { reasoning, ...rest } = VALID_SIGNAL;
    const result = ParsedSignalSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-array entries", () => {
    const result = ParsedSignalSchema.safeParse({ ...VALID_SIGNAL, entries: "1.0850" });
    expect(result.success).toBe(false);
  });

  it("rejects string in entries array", () => {
    const result = ParsedSignalSchema.safeParse({ ...VALID_SIGNAL, entries: ["not-a-number"] });
    expect(result.success).toBe(false);
  });
});
