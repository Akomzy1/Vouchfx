// =============================================================================
// VouchFX — Supabase database types
// Normally generated via: supabase gen types typescript --local > src/types.ts
// Hand-authored here to match migrations 001–004.
// Regenerate after every schema migration.
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ── Column-level union types (keep in sync with CHECK constraints) ────────────

export type Platform          = "MT5" | "MT4";
export type SignalSide        = "BUY" | "SELL";
export type OrderType         = "MARKET" | "LIMIT" | "STOP";
export type SlTpUnit          = "price" | "pips" | "percent";
export type FollowUpType      =
  | "NEW_SIGNAL" | "MODIFY_SL" | "MODIFY_TP" | "MOVE_TO_BE"
  | "CLOSE_PARTIAL" | "CLOSE_ALL" | "CANCEL_PENDING" | "IGNORE";
export type TradeStatus       = "PENDING" | "OPEN" | "CLOSED" | "CANCELLED" | "SKIPPED";
export type AuditEventType    =
  | "received" | "parsed" | "executed" | "skipped"
  | "modified" | "cancelled" | "closed" | "error";
export type TradeEventType    =
  | "opened" | "tp_hit" | "sl_hit"
  | "closed_partial" | "closed_full" | "cancelled"
  | "modified_sl" | "modified_tp" | "moved_to_be";
export type TelegramSessionStatus = "active" | "limited" | "banned" | "disconnected";
export type SizingMode        = "percent_balance" | "fixed_lot" | "fixed_usd_risk";
export type DefaultSlPolicy   = "apply_default" | "skip" | "ask";
export type DailyLossAction   = "pause" | "pause_and_close";
export type SubscriptionPlan  = "trial" | "starter" | "pro" | "funded" | "lifetime";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "expired";
export type SubscriptionProvider = "stripe" | "paystack" | "manual";
export type ReferralStatus    = "pending" | "converted" | "churned";
export type PayoutMethod      = "stripe" | "paystack" | "bank_transfer";
export type PayoutStatus      = "pending" | "processing" | "paid" | "failed";

// ── Phase 2 — Prop Mode ───────────────────────────────────────────────────────
export type UserRole          = "rule_approver";
export type DailyLossBasis    = "equity" | "balance";
export type DrawdownModel     = "static" | "eod_trailing" | "intraday_trailing";
export type PropRulesetStatus = "draft" | "pending_approval" | "published" | "rejected" | "rolled_back";
export type PropRuleAuditAction =
  | "agent_proposal" | "approved" | "rejected" | "auto_published"
  | "published" | "rolled_back" | "rollback_applied";

// ── Table row types ───────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  referral_code: string | null;
  stripe_customer_id: string | null;
  paystack_customer_code: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrokerConnectionRow {
  id: string;
  user_id: string;
  metaapi_account_id: string;
  platform: Platform;
  label: string | null;
  is_active: boolean;
  /** The account new signals route to. At most one per user. */
  is_primary: boolean;
  /** demo | live — from MetaApi account info; null until first sync. */
  account_mode: "demo" | "live" | null;
  last_balance_usd: number | null;
  last_equity_usd: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignalSourceRow {
  id: string;
  user_id: string;
  telegram_chat_id: number;
  title: string | null;
  is_enabled: boolean;
  daily_signal_limit: number | null;
  override_risk_enabled: boolean;
  override_risk_pct: number | null;
  /** Per-channel no-SL policy: null = inherit global. */
  sl_policy: "require" | "apply_default" | null;
  /** Flip BUY/SELL for this channel (SL/TP swapped on reverse). */
  reverse_trades: boolean;
  kill_close_requested_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParsedSignalRow {
  id: string;
  source_id: string;
  telegram_message_id: number;
  edit_version: number;
  raw_text: string | null;
  is_signal: boolean;
  symbol: string | null;
  side: SignalSide | null;
  order_type: OrderType | null;
  entries: number[];
  sl: number | null;
  sl_unit: SlTpUnit | null;
  tps: number[];
  tp_unit: SlTpUnit | null;
  confidence: number;
  reasoning: string;
  follow_up_type: FollowUpType | null;
  references_prior_signal_id: string | null;
  language_detected: string;
  model_used: string;
  parsed_at: string;
}

export interface TradeRow {
  id: string;
  user_id: string;
  parsed_signal_id: string;
  broker_connection_id: string;
  broker_order_id: string | null;
  symbol: string;
  side: SignalSide;
  volume: number;
  entry_price: number | null;
  sl: number | null;
  tp: number | null;
  status: TradeStatus;
  skip_reason: string | null;
  breakeven_applied: boolean;
  is_simulated: boolean;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEventRow {
  id: string;
  user_id: string;
  parsed_signal_id: string | null;
  trade_id: string | null;
  event_type: AuditEventType | string;
  payload: Json;
  created_at: string;
}

export interface TelegramSessionRow {
  id: string;
  user_id: string;
  session_string_encrypted: string;
  api_id: number;
  api_hash_hint: string | null;
  status: TelegramSessionStatus;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskSettingsRow {
  id: string;
  user_id: string;
  sizing_mode: SizingMode;
  risk_per_trade_pct: number;
  fixed_lot_size: number | null;
  fixed_usd_risk: number | null;
  daily_signal_limit: number;
  max_trades_per_day: number | null;
  daily_loss_cap_pct: number | null;
  daily_loss_cap_action: DailyLossAction;
  default_sl_policy: DefaultSlPolicy;
  default_sl_pips: number | null;
  breakeven_after_tp1: boolean;
  trailing_after_tp2: boolean;
  created_at: string;
  updated_at: string;
}

export interface TradeEventRow {
  id: string;
  trade_id: string;
  user_id: string;
  event_type: TradeEventType;
  price: number | null;
  volume: number | null;
  pnl: number | null;
  payload: Json;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  provider: SubscriptionProvider;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReferralRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  referral_code: string;
  status: ReferralStatus;
  first_paid_at: string | null;
  first_month_discount_applied: boolean;
  created_at: string;
}

export interface AffiliateAccountRow {
  id: string;
  user_id: string;
  referral_code: string;
  referral_link_slug: string;
  total_clicks: number;
  total_signups: number;
  total_active_referrals: number;
  pending_payout_usd: number;
  /** Amount moved out of pending while a payout is in flight (request → paid/failed). */
  locked_payout_usd: number;
  lifetime_paid_usd: number;
  payout_method: PayoutMethod | null;
  payout_details_encrypted: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutRow {
  id: string;
  affiliate_account_id: string;
  user_id: string;
  amount_usd: number;
  status: PayoutStatus;
  method: PayoutMethod;
  provider_transfer_id: string | null;
  processed_by: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferenceRow {
  id: string;
  user_id: string;
  event_type: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
}

export type PushSubscriptionInsert = Omit<PushSubscriptionRow, "id" | "created_at"> &
  Partial<Pick<PushSubscriptionRow, "id" | "created_at">>;

export interface NotificationRow {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

// ── Phase 2 row types ─────────────────────────────────────────────────────────

export interface UserRoleRow {
  user_id: string;
  role: UserRole;
  granted_by: string;
  granted_at: string;
}

export interface PropFirmRow {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  active: boolean;
  created_at: string;
}

export interface PropRulesetRow {
  id: string;
  firm_id: string;
  challenge_name: string;
  version: number;
  status: PropRulesetStatus;
  is_current: boolean;
  daily_loss_pct: number;
  daily_loss_basis: DailyLossBasis;
  max_drawdown_pct: number;
  max_drawdown_model: DrawdownModel;
  consistency_pct: number | null;
  news_before_min: number;
  news_after_min: number;
  weekend_holding_allowed: boolean;
  min_trading_days: number;
  copy_trading_permitted: boolean;
  source_url: string | null;
  verified_at: string | null;
  published_by: string | null;
  published_at: string | null;
  agent_confidence: number | null;
  notes: string | null;
  created_at: string;
}

export interface PropAccountProfileRow {
  id: string;
  user_id: string;
  broker_connection_id: string;
  ruleset_id: string;
  enabled: boolean;
  stealth_config: Json | null;
  challenge_start_balance_usd: number | null;
  created_at: string;
  updated_at: string;
}

export interface PropRuleAuditRow {
  id: string;
  firm_id: string;
  ruleset_id: string | null;
  proposal_id: string | null;
  action: PropRuleAuditAction;
  actor: string;
  old_values: Json | null;
  new_values: Json | null;
  source_url: string | null;
  agent_confidence: number | null;
  created_at: string;
}

// ── Phase 2 insert types ──────────────────────────────────────────────────────

export type UserRoleInsert = UserRoleRow;

export type PropFirmInsert =
  Pick<PropFirmRow, "name" | "slug"> &
  Partial<Pick<PropFirmRow, "id" | "website_url" | "active">>;

export type PropRulesetInsert =
  Pick<PropRulesetRow, "firm_id" | "challenge_name" | "daily_loss_pct" | "max_drawdown_pct"> &
  Partial<Omit<PropRulesetRow, "firm_id" | "challenge_name" | "daily_loss_pct" | "max_drawdown_pct" | "id" | "created_at">>;

export type PropAccountProfileInsert =
  Pick<PropAccountProfileRow, "user_id" | "broker_connection_id" | "ruleset_id"> &
  Partial<Pick<PropAccountProfileRow, "id" | "enabled" | "stealth_config" | "challenge_start_balance_usd">>;

export type PropRuleAuditInsert =
  Pick<PropRuleAuditRow, "firm_id" | "action" | "actor"> &
  Partial<Pick<PropRuleAuditRow, "id" | "ruleset_id" | "old_values" | "new_values" | "source_url" | "agent_confidence">>;

// ── Economic calendar cache (migration 026, VCH-RSK-06b/06c) ─────────────────

export type CalendarImpact = "high" | "medium" | "low" | "holiday";
export type CalendarSource = "jblanked" | "forexfactory";
export type CalendarFetchStatus = "success" | "error" | "rate_limited" | "network_error";

export interface CalendarEventRow {
  id: string;
  event_name: string;
  /** ISO currency ('USD', 'EUR', …) or 'All' for global events. */
  currency: string;
  /** Always UTC — converted at ingest. */
  event_time_utc: string;
  impact: CalendarImpact;
  forecast: string | null;
  previous: string | null;
  source: CalendarSource;
  fetched_at: string;
}

export interface CalendarFetchLogRow {
  id: string;
  source: CalendarSource;
  status: CalendarFetchStatus;
  fetched_at: string;
  error: string | null;
}

// ── Insert types (required fields only; optional fields nullable/defaulted) ───

export type UserInsert = Pick<UserRow, "email"> &
  Partial<Pick<UserRow, "id" | "full_name" | "avatar_url" | "referral_code">>;

export type BrokerConnectionInsert = Pick<
  BrokerConnectionRow, "user_id" | "metaapi_account_id"
> & Partial<Pick<BrokerConnectionRow, "id" | "platform" | "label" | "is_active">>;

export type SignalSourceInsert = Pick<SignalSourceRow, "user_id" | "telegram_chat_id"> &
  Partial<Pick<SignalSourceRow, "id" | "title" | "is_enabled" | "daily_signal_limit">>;

export type ParsedSignalInsert =
  Pick<ParsedSignalRow, "source_id" | "telegram_message_id" | "is_signal" | "confidence" | "reasoning" | "model_used"> &
  Partial<Omit<ParsedSignalRow, "source_id" | "telegram_message_id" | "is_signal" | "confidence" | "reasoning" | "model_used" | "id" | "parsed_at">> &
  Partial<Pick<ParsedSignalRow, "id">>;

export type TradeInsert =
  Pick<TradeRow, "user_id" | "parsed_signal_id" | "broker_connection_id" | "symbol" | "side" | "volume"> &
  Partial<Omit<TradeRow, "user_id" | "parsed_signal_id" | "broker_connection_id" | "symbol" | "side" | "volume" | "id" | "created_at" | "updated_at">> &
  Partial<Pick<TradeRow, "id">>;

export type AuditEventInsert = Pick<AuditEventRow, "user_id" | "event_type"> &
  Partial<Pick<AuditEventRow, "id" | "parsed_signal_id" | "trade_id" | "payload">>;

export type TelegramSessionInsert =
  Pick<TelegramSessionRow, "user_id" | "session_string_encrypted" | "api_id"> &
  Partial<Pick<TelegramSessionRow, "id" | "api_hash_hint" | "status" | "last_connected_at">>;

export type RiskSettingsInsert = Pick<RiskSettingsRow, "user_id"> &
  Partial<Omit<RiskSettingsRow, "user_id" | "id" | "created_at" | "updated_at">>;

export type TradeEventInsert =
  Pick<TradeEventRow, "trade_id" | "user_id" | "event_type"> &
  Partial<Pick<TradeEventRow, "id" | "price" | "volume" | "pnl" | "payload">>;

export type SubscriptionInsert =
  Pick<SubscriptionRow, "user_id" | "plan" | "status" | "provider"> &
  Partial<Omit<SubscriptionRow, "user_id" | "plan" | "status" | "provider" | "id" | "created_at" | "updated_at">>;

export type ReferralInsert =
  Pick<ReferralRow, "referrer_id" | "referee_id" | "referral_code"> &
  Partial<Pick<ReferralRow, "id" | "status" | "first_paid_at">>;

export type AffiliateAccountInsert =
  Pick<AffiliateAccountRow, "user_id" | "referral_code" | "referral_link_slug"> &
  Partial<Omit<AffiliateAccountRow, "user_id" | "referral_code" | "referral_link_slug" | "id" | "created_at" | "updated_at">>;

export type PayoutInsert =
  Pick<PayoutRow, "affiliate_account_id" | "user_id" | "amount_usd" | "status" | "method"> &
  Partial<Pick<PayoutRow, "id" | "provider_transfer_id" | "paid_at">>;

export type CalendarEventInsert =
  Pick<CalendarEventRow, "event_name" | "currency" | "event_time_utc" | "impact" | "source"> &
  Partial<Pick<CalendarEventRow, "id" | "forecast" | "previous" | "fetched_at">>;

export type CalendarFetchLogInsert =
  Pick<CalendarFetchLogRow, "source" | "status"> &
  Partial<Pick<CalendarFetchLogRow, "id" | "fetched_at" | "error">>;

// ── Supabase Database type ────────────────────────────────────────────────────

type NoRelationships = { Relationships: [] };

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: UserInsert;
        Update: Partial<UserInsert>;
      } & NoRelationships;
      broker_connections: {
        Row: BrokerConnectionRow;
        Insert: BrokerConnectionInsert;
        Update: Partial<BrokerConnectionInsert>;
      } & NoRelationships;
      signal_sources: {
        Row: SignalSourceRow;
        Insert: SignalSourceInsert;
        Update: Partial<SignalSourceInsert>;
      } & NoRelationships;
      parsed_signals: {
        Row: ParsedSignalRow;
        Insert: ParsedSignalInsert;
        Update: Partial<ParsedSignalInsert>;
      } & NoRelationships;
      trades: {
        Row: TradeRow;
        Insert: TradeInsert;
        Update: Partial<TradeInsert>;
      } & NoRelationships;
      audit_events: {
        Row: AuditEventRow;
        Insert: AuditEventInsert;
        Update: Partial<AuditEventInsert>;
      } & NoRelationships;
      telegram_sessions: {
        Row: TelegramSessionRow;
        Insert: TelegramSessionInsert;
        Update: Partial<TelegramSessionInsert>;
      } & NoRelationships;
      risk_settings: {
        Row: RiskSettingsRow;
        Insert: RiskSettingsInsert;
        Update: Partial<RiskSettingsInsert>;
      } & NoRelationships;
      trade_events: {
        Row: TradeEventRow;
        Insert: TradeEventInsert;
        Update: Partial<TradeEventInsert>;
      } & NoRelationships;
      subscriptions: {
        Row: SubscriptionRow;
        Insert: SubscriptionInsert;
        Update: Partial<SubscriptionInsert>;
      } & NoRelationships;
      referrals: {
        Row: ReferralRow;
        Insert: ReferralInsert;
        Update: Partial<ReferralInsert>;
      } & NoRelationships;
      affiliate_accounts: {
        Row: AffiliateAccountRow;
        Insert: AffiliateAccountInsert;
        Update: Partial<AffiliateAccountInsert>;
      } & NoRelationships;
      payouts: {
        Row: PayoutRow;
        Insert: PayoutInsert;
        Update: Partial<PayoutInsert>;
      } & NoRelationships;
      user_roles: {
        Row: UserRoleRow;
        Insert: UserRoleInsert;
        Update: Partial<UserRoleInsert>;
      } & NoRelationships;
      prop_firms: {
        Row: PropFirmRow;
        Insert: PropFirmInsert;
        Update: Partial<PropFirmInsert>;
      } & NoRelationships;
      prop_rulesets: {
        Row: PropRulesetRow;
        Insert: PropRulesetInsert;
        Update: Partial<PropRulesetInsert>;
      } & NoRelationships;
      prop_account_profiles: {
        Row: PropAccountProfileRow;
        Insert: PropAccountProfileInsert;
        Update: Partial<PropAccountProfileInsert>;
      } & NoRelationships;
      prop_rule_audit: {
        Row: PropRuleAuditRow;
        Insert: PropRuleAuditInsert;
        Update: Partial<PropRuleAuditInsert>;
      } & NoRelationships;
      calendar_events: {
        Row: CalendarEventRow;
        Insert: CalendarEventInsert;
        Update: Partial<CalendarEventInsert>;
      } & NoRelationships;
      calendar_fetch_log: {
        Row: CalendarFetchLogRow;
        Insert: CalendarFetchLogInsert;
        Update: Partial<CalendarFetchLogInsert>;
      } & NoRelationships;
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: PushSubscriptionInsert;
        Update: Partial<PushSubscriptionInsert>;
      } & NoRelationships;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      platform: Platform;
      signal_side: SignalSide;
      order_type: OrderType;
      sl_tp_unit: SlTpUnit;
      follow_up_type: FollowUpType;
      trade_status: TradeStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
