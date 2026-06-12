-- Migration 025: Per-channel SL policy + reverse trades
-- Backs the Channels screen override panel (prototype parity).
--
-- sl_policy: what to do when a signal from THIS channel has no stop loss.
--   NULL            → inherit the global default_sl_policy from risk_settings
--   'require'       → skip the signal (never trade without an SL)
--   'apply_default' → apply the user's default SL (risk_settings.default_sl_pips)
--
-- reverse_trades: flip every BUY to SELL and vice-versa for this channel.
--   On reverse, SL/TP are swapped (original TP1 becomes the stop, original SL
--   becomes the take-profit) so the protective stop stays on the correct side.

ALTER TABLE public.signal_sources
  ADD COLUMN IF NOT EXISTS sl_policy TEXT
    CONSTRAINT signal_sources_sl_policy_check
      CHECK (sl_policy IN ('require', 'apply_default')),

  ADD COLUMN IF NOT EXISTS reverse_trades BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.signal_sources.sl_policy      IS 'Per-channel no-SL policy: NULL = inherit global, require = skip, apply_default = use default SL pips';
COMMENT ON COLUMN public.signal_sources.reverse_trades IS 'Flip BUY/SELL for this channel; SL/TP swapped to keep the stop protective';
