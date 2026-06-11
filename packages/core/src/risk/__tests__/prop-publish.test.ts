import { describe, it, expect } from "vitest";
import {
  classifyProposalStakes,
  isAutoPublishEligible,
  isMorePermissive,
  AUTO_PUBLISH_CONFIDENCE,
  ACCOUNT_KILLING_FIELDS,
  LOW_STAKES_FIELDS,
} from "../prop-publish";

// ── classifyProposalStakes ────────────────────────────────────────────────────

describe("classifyProposalStakes", () => {
  it("returns critical when an account-killing field changes", () => {
    expect(classifyProposalStakes(["daily_loss_pct"])).toBe("critical");
    expect(classifyProposalStakes(["max_drawdown_pct"])).toBe("critical");
    expect(classifyProposalStakes(["consistency_pct"])).toBe("critical");
    expect(classifyProposalStakes(["copy_trading_permitted"])).toBe("critical");
    expect(classifyProposalStakes(["daily_loss_basis"])).toBe("critical");
    expect(classifyProposalStakes(["max_drawdown_model"])).toBe("critical");
  });

  it("returns low_stakes when only low-stakes fields change", () => {
    expect(classifyProposalStakes(["news_before_min"])).toBe("low_stakes");
    expect(classifyProposalStakes(["news_after_min"])).toBe("low_stakes");
    expect(classifyProposalStakes(["weekend_holding_allowed"])).toBe("low_stakes");
    expect(classifyProposalStakes(["min_trading_days"])).toBe("low_stakes");
    expect(
      classifyProposalStakes(["news_before_min", "news_after_min", "min_trading_days"])
    ).toBe("low_stakes");
  });

  it("returns critical when mix of critical and low-stakes fields change", () => {
    expect(classifyProposalStakes(["news_before_min", "daily_loss_pct"])).toBe("critical");
  });

  it("returns low_stakes for empty field list", () => {
    expect(classifyProposalStakes([])).toBe("low_stakes");
  });

  it("covers all account-killing fields", () => {
    for (const f of ACCOUNT_KILLING_FIELDS) {
      expect(classifyProposalStakes([f])).toBe("critical");
    }
  });

  it("covers all low-stakes fields", () => {
    for (const f of LOW_STAKES_FIELDS) {
      expect(classifyProposalStakes([f])).toBe("low_stakes");
    }
  });
});

// ── isAutoPublishEligible ─────────────────────────────────────────────────────

describe("isAutoPublishEligible", () => {
  it("returns true when all low-stakes and confidence meets threshold", () => {
    expect(isAutoPublishEligible(["news_before_min"], AUTO_PUBLISH_CONFIDENCE)).toBe(true);
    expect(isAutoPublishEligible(["min_trading_days"], 0.99)).toBe(true);
  });

  it("returns false when a critical field is present, even at high confidence", () => {
    expect(isAutoPublishEligible(["daily_loss_pct"], 0.99)).toBe(false);
    expect(isAutoPublishEligible(["copy_trading_permitted"], 1.0)).toBe(false);
  });

  it("returns false when confidence is below auto-publish threshold", () => {
    expect(isAutoPublishEligible(["news_before_min"], AUTO_PUBLISH_CONFIDENCE - 0.01)).toBe(false);
    expect(isAutoPublishEligible(["weekend_holding_allowed"], 0.7)).toBe(false);
  });

  it("returns false for empty field list below threshold", () => {
    expect(isAutoPublishEligible([], 0.5)).toBe(false);
  });

  it("returns true for empty field list at or above threshold (no changes = safe)", () => {
    expect(isAutoPublishEligible([], AUTO_PUBLISH_CONFIDENCE)).toBe(true);
  });
});

// ── isMorePermissive ──────────────────────────────────────────────────────────

describe("isMorePermissive", () => {
  it("daily_loss_pct: more permissive when new > old", () => {
    expect(isMorePermissive("daily_loss_pct", 5, 6)).toBe(true);
    expect(isMorePermissive("daily_loss_pct", 5, 4)).toBe(false);
  });

  it("news_before_min: more permissive when new < old (shorter window)", () => {
    expect(isMorePermissive("news_before_min", 5, 2)).toBe(true);
    expect(isMorePermissive("news_before_min", 2, 5)).toBe(false);
  });

  it("weekend_holding_allowed: more permissive when false → true", () => {
    expect(isMorePermissive("weekend_holding_allowed", false, true)).toBe(true);
    expect(isMorePermissive("weekend_holding_allowed", true, false)).toBe(false);
  });

  it("copy_trading_permitted: more permissive when false → true", () => {
    expect(isMorePermissive("copy_trading_permitted", false, true)).toBe(true);
    expect(isMorePermissive("copy_trading_permitted", true, false)).toBe(false);
  });

  it("unknown field always returns false", () => {
    expect(isMorePermissive("challenge_name", "A", "B")).toBe(false);
  });
});
