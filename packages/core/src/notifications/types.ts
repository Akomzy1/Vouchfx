export const NOTIFY_EVENTS = [
  "broker_disconnect",
  "daily_loss_cap_hit",
  "telegram_session_limited",
  "trade_opened",
  "trade_closed",
  "prop_rule_proposal",
  "prop_rule_published",
] as const;

export type NotifyEventType = (typeof NOTIFY_EVENTS)[number];

export interface NotifyEventMeta {
  title: string;
  description: string;
}

export const NOTIFY_EVENT_META: Record<NotifyEventType, NotifyEventMeta> = {
  broker_disconnect:         { title: "Broker disconnected",          description: "Alert when your MT5 connection goes offline." },
  daily_loss_cap_hit:        { title: "Daily loss cap hit",           description: "Alert when your intraday drawdown limit is reached." },
  telegram_session_limited:  { title: "Telegram session limited",     description: "Alert when Telegram flags your session." },
  trade_opened:              { title: "Trade opened",                  description: "Alert each time a new trade leg is placed." },
  trade_closed:              { title: "Trade closed",                  description: "Alert each time a position is closed." },
  prop_rule_proposal:        { title: "New rule proposal",             description: "Alert (approvers) when the Rule Monitor detects a rule change." },
  prop_rule_published:       { title: "Prop rules updated",            description: "Alert when a rule change is published for your prop challenge." },
};
