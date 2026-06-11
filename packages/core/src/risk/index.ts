export type { SymbolSpec, RiskSettings, SizingMode, SlPolicy } from "./types";
export { DEFAULT_RISK_SETTINGS } from "./types";
export type { SlUnit } from "./sl-resolve";
export { resolveSlDistance } from "./sl-resolve";
export { roundToStep, clampVolume, computeVolume } from "./sizing";
export type { ComputeVolumeInput, ComputeVolumeResult } from "./sizing";
export { gateAndSize } from "./gate";
export type { GateInput, GateResult } from "./gate";
export { evaluatePropRules } from "./prop-gate";
export type { PropRuleset, PropAccountState, PropRuleCheck, PropGateResult } from "./prop-gate";
export {
  computeDrawdownFloor,
  computeDailyLossFloor,
  computeEffectiveFloor,
  buildDrawdownStatus,
} from "./drawdown-tracker";
export type {
  DrawdownModel,
  DailyLossBasis,
  DrawdownFloorParams,
  DailyLossFloorParams,
  DrawdownStatus,
} from "./drawdown-tracker";
export { EquityGuardian } from "./equity-guardian";
export type {
  EquityGuardianConfig,
  EquitySnapshot,
  GuardianDecision,
  EquityGuardianPersistedState,
} from "./equity-guardian";
export { computeConsistencyStatus, consistencyBlockReason } from "./consistency-manager";
export type {
  DailyPnlEntry,
  ConsistencyAction,
  ConsistencyStatus,
  ConsistencyManagerConfig,
} from "./consistency-manager";
export { isInNewsWindow, isWeekendRisk, checkMinTradingDays, symbolCurrencies } from "./prop-timing";
export type { NewsEvent, NewsWindowConfig, MinTradingDaysStatus } from "./prop-timing";
export {
  classifyProposalStakes,
  isAutoPublishEligible,
  isMorePermissive,
  stakesLabel,
  ACCOUNT_KILLING_FIELDS,
  LOW_STAKES_FIELDS,
  PROPOSAL_CONFIDENCE_THRESHOLD,
  AUTO_PUBLISH_CONFIDENCE,
} from "./prop-publish";
export type { ProposalStakes, AccountKillingField, LowStakesField } from "./prop-publish";
