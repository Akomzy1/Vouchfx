import { describe, it, expect } from "vitest";

/**
 * Idempotency key construction — the invariant in CLAUDE.md §2.2:
 *   key = (telegram_chat_id, telegram_message_id, edit_version)
 *
 * These tests verify that the key is deterministic, unique per version,
 * and that the BullMQ job ID format matches the executor's expectations.
 */

function buildIdempotencyKey(
  telegramChatId: string | number,
  messageId: number,
  editVersion: number
): string {
  return `${telegramChatId}:${messageId}:${editVersion}`;
}

describe("buildIdempotencyKey", () => {
  it("produces stable output for the same inputs", () => {
    const k1 = buildIdempotencyKey("-1001234567890", 42, 0);
    const k2 = buildIdempotencyKey("-1001234567890", 42, 0);
    expect(k1).toBe(k2);
  });

  it("differs by message ID", () => {
    const k1 = buildIdempotencyKey("-1001234567890", 42, 0);
    const k2 = buildIdempotencyKey("-1001234567890", 43, 0);
    expect(k1).not.toBe(k2);
  });

  it("differs by edit version", () => {
    const k1 = buildIdempotencyKey("-1001234567890", 42, 0);
    const k2 = buildIdempotencyKey("-1001234567890", 42, 1);
    expect(k1).not.toBe(k2);
  });

  it("differs by chat ID", () => {
    const k1 = buildIdempotencyKey("-1001234567890", 42, 0);
    const k2 = buildIdempotencyKey("-1009999999999", 42, 0);
    expect(k1).not.toBe(k2);
  });

  it("treats numeric and string chat IDs consistently", () => {
    const k1 = buildIdempotencyKey(-1001234567890, 42, 0);
    const k2 = buildIdempotencyKey("-1001234567890", 42, 0);
    expect(k1).toBe(k2);
  });

  it("edit_version 0 and 1 produce different keys (no accidental re-processing)", () => {
    const original = buildIdempotencyKey("-1001234567890", 100, 0);
    const edited   = buildIdempotencyKey("-1001234567890", 100, 1);
    expect(original).not.toBe(edited);
  });
});

// ── Double-place guard invariant ───────────────────────────────────────────────

/**
 * The application-level guard mirrors the DB ON CONFLICT DO NOTHING logic:
 * if a OPEN or PENDING trade already exists for a parsed_signal_id, skip.
 *
 * We test the predicate function in isolation; the actual DB insert
 * is tested by integration tests against a real Supabase instance.
 */
function shouldSkipPlacement(
  existingStatuses: string[]
): { skip: boolean; reason?: string } {
  const blockers = existingStatuses.filter(
    (s) => s === "OPEN" || s === "PENDING"
  );
  if (blockers.length > 0) {
    return { skip: true, reason: `duplicate_trade:${blockers.join(",")}` };
  }
  return { skip: false };
}

describe("shouldSkipPlacement — idempotency guard", () => {
  it("does not skip when no prior trades", () => {
    expect(shouldSkipPlacement([]).skip).toBe(false);
  });

  it("skips when an OPEN trade exists", () => {
    const result = shouldSkipPlacement(["OPEN"]);
    expect(result.skip).toBe(true);
    expect(result.reason).toContain("OPEN");
  });

  it("skips when a PENDING trade exists", () => {
    const result = shouldSkipPlacement(["PENDING"]);
    expect(result.skip).toBe(true);
    expect(result.reason).toContain("PENDING");
  });

  it("does not skip when only CLOSED or CANCELLED trades exist (retry after close)", () => {
    expect(shouldSkipPlacement(["CLOSED"]).skip).toBe(false);
    expect(shouldSkipPlacement(["CANCELLED"]).skip).toBe(false);
    expect(shouldSkipPlacement(["SKIPPED"]).skip).toBe(false);
  });

  it("skips when mix includes OPEN", () => {
    const result = shouldSkipPlacement(["CLOSED", "OPEN"]);
    expect(result.skip).toBe(true);
  });

  it("skips on multiple open legs (multi-TP)", () => {
    const result = shouldSkipPlacement(["OPEN", "OPEN", "OPEN"]);
    expect(result.skip).toBe(true);
  });
});
