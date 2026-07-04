export * from "./types";
export * from "./parser";
// executor (MetaApiExecutor) is intentionally NOT re-exported here — it depends
// on metaapi.cloud-sdk which must not be bundled into the web app.
// Import it directly: import { MetaApiExecutor } from "@vouchfx/core/executor"
// stealth is pure (no I/O) and safe for the web bundle:
export { applyStealth, DEFAULT_STEALTH_CONFIG } from "./executor/stealth";
export type { StealthConfig, StealthInput, StealthOutput } from "./executor/stealth";
// deal-sync helpers are pure (no I/O) — used by the executor's trade-sync job:
export { extractCloseDeals, isFullyClosed, reconcileTradeCloses } from "./executor/deal-sync";
export type { CloseDeal, TradeCloseReconciliation } from "./executor/deal-sync";
export * from "./crypto/session";
export * from "./risk";
// Performance analytics — pure metric formulas (no I/O), safe for the web bundle.
export * from "./performance";
export * from "./notifications";
export * from "./billing";
export * from "./logger";
// monitoring (@sentry/node) is intentionally NOT re-exported here — Node-only.
// Import directly: import { initSentry, captureException, startHeartbeat } from "@vouchfx/core/monitoring"
