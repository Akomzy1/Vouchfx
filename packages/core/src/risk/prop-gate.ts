/**
 * Prop Mode rule gate — pure, no I/O.
 *
 * Evaluates a signal against a firm's active ruleset BEFORE execution
 * (VCH-PROP-10). The caller is responsible for writing checks to audit_events.
 * Per-account profiles run independently: call once per broker account.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Subset of prop_rulesets columns needed for gate evaluation. */
export interface PropRuleset {
  dailyLossPct: number;
  /** equity | balance: which metric the daily-loss floor uses. */
  dailyLossBasis: "equity" | "balance";
  maxDrawdownPct: number;
  /** How the max-drawdown floor moves over time. */
  maxDrawdownModel: "static" | "eod_trailing" | "intraday_trailing";
  /** Max % of total period profit allowed in one day. null = no rule. */
  consistencyPct: number | null;
  weekendHoldingAllowed: boolean;
  copyTradingPermitted: boolean;
}

/** Live account state snapshot — populated by the executor before calling the gate. */
export interface PropAccountState {
  /** Live equity (balance + unrealized PnL). */
  currentEquityUsd: number;
  /** Settled balance (no floating). */
  currentBalanceUsd: number;
  /** Equity at the start of today's trading session (00:00 UTC or broker reset). */
  dayStartEquityUsd: number;
  /** Balance at the start of today. */
  dayStartBalanceUsd: number;
  /** Initial balance when the prop challenge began (static drawdown reference). */
  challengeStartBalanceUsd: number;
  /** Highest equity ever recorded (intraday-trailing drawdown reference). */
  peakEquityUsd: number;
  /** Highest end-of-day balance recorded (EOD-trailing drawdown reference). */
  eodPeakBalanceUsd: number;
  /** Cumulative realized profit for the current evaluation period. */
  periodTotalProfitUsd: number;
  /** Realized profit today (consistency check). */
  todayProfitUsd: number;
  /** True if the current time falls within the firm's news exclusion window. */
  inNewsWindow: boolean;
  /**
   * True if placing a trade now risks holding over the weekend (e.g. Friday near
   * market close) and the firm bans weekend holding.
   */
  isWeekendRisk: boolean;
}

export interface PropRuleCheck {
  /** Machine-readable rule identifier. */
  rule: string;
  passed: boolean;
  /** Measured value — number or descriptive string. */
  current: number | string | null;
  /** Threshold/limit from the ruleset. */
  limit: number | string | null;
  /** Human-readable reason for failure; null when passed. */
  reason: string | null;
}

export interface PropGateResult {
  /** True only if every rule passed. */
  passed: boolean;
  /** Ordered list of all rule checks for the audit log. */
  checks: PropRuleCheck[];
  /** First failing rule's reason string; null when passed. */
  blockingReason: string | null;
}

// ── Gate ──────────────────────────────────────────────────────────────────────

/**
 * Evaluate all applicable prop firm rules against the current account state.
 * Returns a structured result suitable for writing directly to audit_events.
 */
export function evaluatePropRules(
  ruleset: PropRuleset,
  state: PropAccountState,
): PropGateResult {
  const checks: PropRuleCheck[] = [];

  // 1. Copy-trading permission ───────────────────────────────────────────────
  // LAUNCH CRITERION: only permitted firms are seeded; this catches rule changes.
  if (!ruleset.copyTradingPermitted) {
    checks.push({
      rule: "copy_trading_permitted",
      passed: false,
      current: "not_permitted",
      limit: null,
      reason: "Firm has restricted copy trading or EAs — cannot execute without TOS breach",
    });
  } else {
    checks.push({ rule: "copy_trading_permitted", passed: true, current: null, limit: null, reason: null });
  }

  // 2. Daily loss ────────────────────────────────────────────────────────────
  // Basis determines what we measure the loss from.
  //   equity   → dayStartEquity  - currentEquity  (includes floating drawdown)
  //   balance  → dayStartBalance - currentEquity  (balance-pegged floor, equity value)
  const dailyLossBase =
    ruleset.dailyLossBasis === "equity"
      ? state.dayStartEquityUsd
      : state.dayStartBalanceUsd;
  const dailyLossAmount = dailyLossBase - state.currentEquityUsd;
  const dailyLossActualPct =
    dailyLossBase > 0 ? (dailyLossAmount / dailyLossBase) * 100 : 0;
  const dailyLossPassed = dailyLossActualPct < ruleset.dailyLossPct;
  checks.push({
    rule: "daily_loss",
    passed: dailyLossPassed,
    current: r2(dailyLossActualPct),
    limit: ruleset.dailyLossPct,
    reason: dailyLossPassed
      ? null
      : `Daily loss ${r2(dailyLossActualPct)}% at or exceeding limit of ${ruleset.dailyLossPct}%`,
  });

  // 3. Max drawdown ──────────────────────────────────────────────────────────
  // Floor calculation depends on the drawdown model.
  let drawdownFloor: number;
  if (ruleset.maxDrawdownModel === "static") {
    // Floor is always relative to the initial challenge deposit.
    drawdownFloor = state.challengeStartBalanceUsd * (1 - ruleset.maxDrawdownPct / 100);
  } else if (ruleset.maxDrawdownModel === "eod_trailing") {
    // Floor trails the highest end-of-day balance ever recorded.
    drawdownFloor = state.eodPeakBalanceUsd * (1 - ruleset.maxDrawdownPct / 100);
  } else {
    // intraday_trailing: floor trails the highest intraday equity tick.
    drawdownFloor = state.peakEquityUsd * (1 - ruleset.maxDrawdownPct / 100);
  }
  const drawdownPassed = state.currentEquityUsd > drawdownFloor;
  // Report as % from challenge start for consistent display.
  const drawdownActualPct =
    state.challengeStartBalanceUsd > 0
      ? ((state.challengeStartBalanceUsd - state.currentEquityUsd) /
          state.challengeStartBalanceUsd) *
        100
      : 0;
  checks.push({
    rule: "max_drawdown",
    passed: drawdownPassed,
    current: r2(drawdownActualPct),
    limit: ruleset.maxDrawdownPct,
    reason: drawdownPassed
      ? null
      : `Drawdown ${r2(drawdownActualPct)}% at or exceeding limit of ${ruleset.maxDrawdownPct}%; equity floor $${r2(drawdownFloor)}`,
  });

  // 4. Consistency (if the firm has one) ────────────────────────────────────
  // Checks that today's profit has not already exceeded the per-day cap.
  // The consistency *manager* (P2.6) handles the pre-emptive throttle;
  // this gate blocks execution if the cap is already breached for today.
  if (ruleset.consistencyPct !== null && state.periodTotalProfitUsd > 0) {
    const consistencyCap =
      state.periodTotalProfitUsd * (ruleset.consistencyPct / 100);
    const consistencyPassed = state.todayProfitUsd < consistencyCap;
    checks.push({
      rule: "consistency",
      passed: consistencyPassed,
      current: r2(state.todayProfitUsd),
      limit: r2(consistencyCap),
      reason: consistencyPassed
        ? null
        : `Today's profit $${r2(state.todayProfitUsd)} at or exceeding consistency cap $${r2(consistencyCap)} (${ruleset.consistencyPct}% of period total $${r2(state.periodTotalProfitUsd)})`,
    });
  }

  // 5. News window ──────────────────────────────────────────────────────────
  // The caller computes inNewsWindow using the firm's specific
  // news_before_min / news_after_min (not a generic toggle).
  if (state.inNewsWindow) {
    checks.push({
      rule: "news_window",
      passed: false,
      current: "in_window",
      limit: null,
      reason: "Signal falls within the firm's news exclusion window",
    });
  } else {
    checks.push({ rule: "news_window", passed: true, current: null, limit: null, reason: null });
  }

  // 6. Weekend holding ──────────────────────────────────────────────────────
  if (state.isWeekendRisk && !ruleset.weekendHoldingAllowed) {
    checks.push({
      rule: "weekend_holding",
      passed: false,
      current: "weekend_risk",
      limit: null,
      reason: "Firm does not allow holding positions over the weekend",
    });
  } else {
    checks.push({
      rule: "weekend_holding",
      passed: true,
      current: null,
      limit: null,
      reason: null,
    });
  }

  const firstFailing = checks.find((c) => !c.passed);
  return {
    passed: firstFailing === undefined,
    checks,
    blockingReason: firstFailing?.reason ?? null,
  };
}

/** Round to 2 decimal places for display/audit values. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
