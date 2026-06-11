import { describe, it, expect } from "vitest";

/**
 * Cancel vs Close semantics — CLAUDE.md §2.7:
 *   CANCEL_PENDING  → delete an *unfilled pending order* (status = PENDING)
 *   CLOSE_ALL       → close a *filled position* (status = OPEN)
 *   CLOSE_PARTIAL   → close part of a filled position (status = OPEN)
 *   Telegram delete/edit on unfilled pending → treat as cancel
 *
 * These tests verify the routing predicate in isolation.
 */

type TradeStatus = "PENDING" | "OPEN" | "CLOSED" | "CANCELLED" | "SKIPPED";
type FollowUpType = "CANCEL_PENDING" | "CLOSE_ALL" | "CLOSE_PARTIAL" | "MODIFY_SL" | "MODIFY_TP" | "MOVE_TO_BE" | "NEW_SIGNAL" | "IGNORE";

interface TradeRef {
  id: string;
  status: TradeStatus;
}

interface DispatchResult {
  action: "cancel" | "close" | "modify" | "none";
  reason?: string;
}

function dispatchFollowUp(
  followUpType: FollowUpType,
  trades: TradeRef[]
): DispatchResult {
  const open    = trades.filter((t) => t.status === "OPEN");
  const pending = trades.filter((t) => t.status === "PENDING");

  switch (followUpType) {
    case "CANCEL_PENDING":
      if (pending.length === 0) {
        // All filled — treat as close (no pending orders to cancel)
        if (open.length > 0) return { action: "close", reason: "cancel_on_filled:treating_as_close" };
        return { action: "none", reason: "no_active_trades" };
      }
      return { action: "cancel", reason: `cancelling:${pending.length}_pending` };

    case "CLOSE_ALL":
      if (open.length === 0) return { action: "none", reason: "no_open_positions" };
      return { action: "close", reason: `closing:${open.length}_open` };

    case "CLOSE_PARTIAL":
      if (open.length === 0) return { action: "none", reason: "no_open_positions" };
      return { action: "close", reason: "partial_close" };

    case "MODIFY_SL":
    case "MODIFY_TP":
    case "MOVE_TO_BE":
      if (open.length === 0 && pending.length === 0)
        return { action: "none", reason: "no_active_trades" };
      return { action: "modify" };

    default:
      return { action: "none" };
  }
}

describe("CANCEL_PENDING semantics", () => {
  it("cancels pending orders when they are unfilled", () => {
    const result = dispatchFollowUp("CANCEL_PENDING", [
      { id: "t1", status: "PENDING" },
      { id: "t2", status: "PENDING" },
    ]);
    expect(result.action).toBe("cancel");
  });

  it("treats as close when all orders already filled (OPEN)", () => {
    const result = dispatchFollowUp("CANCEL_PENDING", [
      { id: "t1", status: "OPEN" },
    ]);
    expect(result.action).toBe("close");
    expect(result.reason).toContain("filled");
  });

  it("no-ops when no active trades remain", () => {
    const result = dispatchFollowUp("CANCEL_PENDING", [
      { id: "t1", status: "CLOSED" },
    ]);
    expect(result.action).toBe("none");
  });
});

describe("CLOSE_ALL semantics", () => {
  it("closes all open positions", () => {
    const result = dispatchFollowUp("CLOSE_ALL", [
      { id: "t1", status: "OPEN" },
      { id: "t2", status: "OPEN" },
    ]);
    expect(result.action).toBe("close");
    expect(result.reason).toContain("2_open");
  });

  it("no-ops when no open positions exist", () => {
    const result = dispatchFollowUp("CLOSE_ALL", [
      { id: "t1", status: "CANCELLED" },
    ]);
    expect(result.action).toBe("none");
  });

  it("does NOT treat pending orders as open (CANCEL_PENDING vs CLOSE_ALL distinction)", () => {
    const cancelResult = dispatchFollowUp("CANCEL_PENDING", [
      { id: "t1", status: "PENDING" },
    ]);
    const closeResult = dispatchFollowUp("CLOSE_ALL", [
      { id: "t1", status: "PENDING" }, // PENDING ≠ filled position
    ]);
    expect(cancelResult.action).toBe("cancel");
    expect(closeResult.action).toBe("none"); // No open positions to close
  });
});

describe("CLOSE_PARTIAL semantics", () => {
  it("routes to close action for open positions", () => {
    const result = dispatchFollowUp("CLOSE_PARTIAL", [
      { id: "t1", status: "OPEN" },
      { id: "t2", status: "OPEN" },
      { id: "t3", status: "OPEN" },
    ]);
    expect(result.action).toBe("close");
    expect(result.reason).toBe("partial_close");
  });
});

describe("MODIFY semantics", () => {
  it("MODIFY_SL routes to modify for open or pending", () => {
    expect(dispatchFollowUp("MODIFY_SL", [{ id: "t1", status: "OPEN" }]).action).toBe("modify");
    expect(dispatchFollowUp("MODIFY_SL", [{ id: "t1", status: "PENDING" }]).action).toBe("modify");
  });

  it("MOVE_TO_BE no-ops when no active trades", () => {
    expect(dispatchFollowUp("MOVE_TO_BE", [{ id: "t1", status: "CLOSED" }]).action).toBe("none");
  });
});

describe("combined legs — mixed statuses", () => {
  it("CLOSE_ALL with mix of OPEN and CLOSED only closes the open legs", () => {
    const result = dispatchFollowUp("CLOSE_ALL", [
      { id: "t1", status: "OPEN" },
      { id: "t2", status: "CLOSED" }, // already done
      { id: "t3", status: "OPEN" },
    ]);
    expect(result.action).toBe("close");
    expect(result.reason).toContain("2_open");
  });
});
