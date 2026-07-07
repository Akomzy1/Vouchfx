/** Broker-supplied specification for a trading symbol. */
export interface SymbolSpec {
  symbol: string;
  /** Units per 1 lot (100000 for most forex pairs, 100 for XAUUSD). */
  contractSize: number;
  /** Smallest price movement (0.00001 for 5-decimal forex, 0.01 for XAUUSD). */
  tickSize: number;
  /** Quote decimal places (5 for fractional forex, 3 for JPY, 2-3 for gold). */
  digits?: number;
  /** Monetary gain/loss per tick per 1 lot in the account currency. */
  tickValue: number;
  /** Minimum lot increment (e.g. 0.01). */
  volumeStep: number;
  /** Minimum lot size (e.g. 0.01). */
  volumeMin: number;
  /** Maximum lot size (e.g. 500). */
  volumeMax: number;
}

export type SizingMode = "percent_balance" | "fixed_lot" | "fixed_dollar_risk";
export type SlPolicy = "apply_default" | "skip" | "ask";
export type DailyLossAction = "pause" | "pause_and_close";
export type ExecutionMode = "apply_my_rules" | "mirror_provider";
export type MirrorLotMode = "provider_lot" | "fixed_lot" | "risk_based";

/** User-configured risk settings for a broker connection. */
export interface RiskSettings {
  mode: SizingMode;
  /** For percent_balance: percentage of balance to risk per trade (e.g. 0.5 = 0.5%). */
  riskPercent: number;
  /** For fixed_lot: lot size per leg. */
  fixedLot: number;
  /** For fixed_dollar_risk: dollar amount to risk per trade. */
  fixedDollarRisk: number;
  /** Fallback SL in pips when signal.sl is null and policy is apply_default (forex/general). */
  defaultSlPips: number;
  /** Fallback SL in pips for GOLD/metals (XAU/XAG) — gold needs a much wider stop than forex. */
  defaultSlPipsGold: number;
  /** What to do when a signal arrives with no stop loss. */
  defaultSlPolicy: SlPolicy;
  /** Max concurrent open trades across the account (0 = unlimited). */
  maxTrades: number;
  /** Max orders/positions placed per day (0 = unlimited). */
  maxTradesPerDay: number;
  /** Max signals acted on per day (0 = unlimited, system-locks free trial to 1). */
  dailySignalLimit: number;
  /** Pause copying when today's realised+floating loss ≥ this % of balance (0 = disabled). */
  dailyLossCapPercent: number;
  /** What to do when the daily loss cap is hit. */
  dailyLossCapAction: DailyLossAction;
  /** Move SL to entry_price when the first TP leg closes. */
  breakevenAfterTp1: boolean;
  /** Enable trailing stop management after TP2 leg closes (future). */
  trailingAfterTp2: boolean;
  /** Whether to mirror the provider's SL/TP exactly or apply user's own risk rules. */
  executionMode: ExecutionMode;
  /** Volume sizing sub-choice when executionMode = mirror_provider. */
  mirrorLotMode: MirrorLotMode;
  /** Allow signals with no SL to execute in mirror mode (explicit opt-in). */
  mirrorAllowNoSl: boolean;
  /** Pause copying around high-impact economic events (NFP, CPI, rate decisions). */
  newsFilterEnabled: boolean;
  /** Minutes to blackout before AND after each high-impact news event. */
  newsFilterWindowMin: number;
}

export const DEFAULT_RISK_SETTINGS: Readonly<RiskSettings> = {
  mode: "percent_balance",
  riskPercent: 0.5,
  fixedLot: 0.01,
  fixedDollarRisk: 10,
  defaultSlPips: 20,
  defaultSlPipsGold: 150,
  defaultSlPolicy: "skip",
  maxTrades: 0,
  maxTradesPerDay: 0,
  dailySignalLimit: 0,
  dailyLossCapPercent: 0,
  dailyLossCapAction: "pause",
  breakevenAfterTp1: false,
  trailingAfterTp2: false,
  executionMode: "apply_my_rules",
  mirrorLotMode: "risk_based",
  mirrorAllowNoSl: false,
  newsFilterEnabled: false,
  newsFilterWindowMin: 60,
};
