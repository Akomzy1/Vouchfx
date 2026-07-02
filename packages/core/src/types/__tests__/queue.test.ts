import { describe, it, expect } from "vitest";
import { accountSignalJobId, accountCancelJobId } from "../queue";

/**
 * Multi-account fan-out (VCH-BRK-04): a signal copies to every copy-enabled
 * account. Correctness rests on two properties:
 *   1. Each account's job id is DISTINCT (BullMQ won't dedupe accounts into one).
 *   2. Same signal + same account → SAME id (still idempotent per account).
 */

const BASE = "-1001234567890:42:0"; // chat:msg:edit
const ACC_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACC_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("accountSignalJobId", () => {
  it("combines the base key and broker id, colon-free (BullMQ rejects ':')", () => {
    expect(accountSignalJobId(BASE, ACC_A)).toBe(`${BASE}:${ACC_A}`.replace(/:/g, "_"));
    expect(accountSignalJobId(BASE, ACC_A)).not.toContain(":");
  });

  it("is stable for the same signal + account (idempotent per account)", () => {
    expect(accountSignalJobId(BASE, ACC_A)).toBe(accountSignalJobId(BASE, ACC_A));
  });

  it("differs across accounts so both accounts execute (no BullMQ dedup)", () => {
    expect(accountSignalJobId(BASE, ACC_A)).not.toBe(accountSignalJobId(BASE, ACC_B));
  });

  it("fanning one signal to N accounts yields N distinct job ids", () => {
    const accounts = [ACC_A, ACC_B, "cccccccc-cccc-cccc-cccc-cccccccccccc"];
    const ids = accounts.map((a) => accountSignalJobId(BASE, a));
    expect(new Set(ids).size).toBe(accounts.length);
  });
});

describe("accountCancelJobId", () => {
  it("formats a per-account cancel key, colon-free", () => {
    expect(accountCancelJobId("-100123", 42, ACC_A)).toBe(`-100123_42_cancel_${ACC_A}`);
    expect(accountCancelJobId("-100123", 42, ACC_A)).not.toContain(":");
  });

  it("differs across accounts", () => {
    expect(accountCancelJobId("-100123", 42, ACC_A)).not.toBe(accountCancelJobId("-100123", 42, ACC_B));
  });

  it("never collides with a signal job id for the same message", () => {
    expect(accountCancelJobId("-100123", 42, ACC_A)).not.toBe(accountSignalJobId("-100123:42:0", ACC_A));
  });
});

/**
 * The executor's idempotency pre-check is scoped to the job's account, so a
 * signal already executed on account A must NOT block account B. This mirrors
 * `.eq("parsed_signal_id", …).eq("broker_connection_id", …)` in the worker.
 */
function shouldSkipForAccount(
  legs: Array<{ brokerConnectionId: string; status: string }>,
  brokerConnectionId: string
): boolean {
  return legs.some(
    (l) =>
      l.brokerConnectionId === brokerConnectionId &&
      (l.status === "OPEN" || l.status === "PENDING")
  );
}

describe("per-account idempotency pre-check", () => {
  const legs = [
    { brokerConnectionId: ACC_A, status: "OPEN" }, // A already traded this signal
  ];

  it("skips the account that already has an active leg", () => {
    expect(shouldSkipForAccount(legs, ACC_A)).toBe(true);
  });

  it("does NOT skip a different account with no leg yet (both accounts execute)", () => {
    expect(shouldSkipForAccount(legs, ACC_B)).toBe(false);
  });

  it("re-delivery of A's job is still deduped (same account, active leg)", () => {
    expect(shouldSkipForAccount([...legs, { brokerConnectionId: ACC_A, status: "OPEN" }], ACC_A)).toBe(true);
  });
});
