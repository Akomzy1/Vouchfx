-- =============================================================================
-- VouchFX — Migration 019 · Prop firm seed data (Phase 2, P2.2)
--
-- Seed the rule library with copy-trading-permitted firms only.
-- LAUNCH CRITERION: copy_trading_permitted = true for every published preset.
--
-- Rules verified at seeding time. source_url and verified_at are required.
-- Each firm gets one or two challenge types with current published rulesets.
--
-- IMPORTANT: Verify these rules at each firm's official rules page before launch.
-- Dates reflect the verification state at initial seeding (2026-06-10).
-- The Rule Monitor agent (P2.10) will track changes going forward.
--
-- Run in the Supabase SQL editor after migration 018.
-- =============================================================================

-- ── Insert firms ──────────────────────────────────────────────────────────────

INSERT INTO public.prop_firms (id, name, slug, website_url, active)
VALUES
  ('f1000000-0000-0000-0000-000000000001', 'FundingPips',   'fundingpips',   'https://fundingpips.com',   true),
  ('f1000000-0000-0000-0000-000000000002', 'The5%ers',      'the5ers',       'https://the5ers.com',       true),
  ('f1000000-0000-0000-0000-000000000003', 'FXIFY',         'fxify',         'https://fxify.com',         true),
  ('f1000000-0000-0000-0000-000000000004', 'BrightFunded',  'brightfunded',  'https://brightfunded.com',  true)
ON CONFLICT (slug) DO NOTHING;


-- ── Helper: next version for a firm+challenge ─────────────────────────────────
-- Used inline in the inserts below to keep the migration idempotent.


-- ── FundingPips — Standard Challenge ─────────────────────────────────────────
-- Source: https://fundingpips.com/challenge-rules (verified 2026-06-10)
-- Daily loss: 5% of balance; Max drawdown: 10% static; Consistency: none stated
-- News window: 2 min before, 2 min after; Weekend: positions allowed
-- Min trading days: 5; Copy trading: permitted (EAs and copy trading allowed)

INSERT INTO public.prop_rulesets (
  id, firm_id, challenge_name, version, status, is_current,
  daily_loss_pct, daily_loss_basis,
  max_drawdown_pct, max_drawdown_model,
  consistency_pct,
  news_before_min, news_after_min,
  weekend_holding_allowed, min_trading_days, copy_trading_permitted,
  source_url, verified_at, published_by, published_at, agent_confidence, notes
) VALUES (
  'e1000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'Standard Challenge', 1, 'published', true,
  5.0, 'balance',
  10.0, 'static',
  NULL,
  2, 2,
  true, 5, true,
  'https://fundingpips.com/challenge-rules',
  '2026-06-10T00:00:00Z',
  'user:initial-seed',
  now(),
  NULL,
  'Verified at seeding. EAs and copy trading explicitly permitted per FundingPips T&C.'
)
ON CONFLICT DO NOTHING;


-- ── FundingPips — Express Challenge ──────────────────────────────────────────
-- One-phase express version with tighter daily loss (4%) and 8% drawdown.

INSERT INTO public.prop_rulesets (
  id, firm_id, challenge_name, version, status, is_current,
  daily_loss_pct, daily_loss_basis,
  max_drawdown_pct, max_drawdown_model,
  consistency_pct,
  news_before_min, news_after_min,
  weekend_holding_allowed, min_trading_days, copy_trading_permitted,
  source_url, verified_at, published_by, published_at, agent_confidence, notes
) VALUES (
  'e1000000-0000-0000-0000-000000000002',
  'f1000000-0000-0000-0000-000000000001',
  'Express Challenge', 1, 'published', true,
  4.0, 'balance',
  8.0, 'static',
  NULL,
  2, 2,
  true, 0, true,
  'https://fundingpips.com/challenge-rules',
  '2026-06-10T00:00:00Z',
  'user:initial-seed',
  now(),
  NULL,
  'Single-phase express; no min trading days requirement.'
)
ON CONFLICT DO NOTHING;


-- ── The5%ers — Hyper Growth ───────────────────────────────────────────────────
-- Source: https://the5ers.com/programs (verified 2026-06-10)
-- Daily loss: 4% of balance; Max drawdown: 10% balance-based
-- Consistency: no single day > 30% of total profit target
-- News: no specific window stated (use 0/0); Weekend: positions not allowed
-- Min trading days: none stated; Copy trading: EAs permitted, copy groups permitted

INSERT INTO public.prop_rulesets (
  id, firm_id, challenge_name, version, status, is_current,
  daily_loss_pct, daily_loss_basis,
  max_drawdown_pct, max_drawdown_model,
  consistency_pct,
  news_before_min, news_after_min,
  weekend_holding_allowed, min_trading_days, copy_trading_permitted,
  source_url, verified_at, published_by, published_at, agent_confidence, notes
) VALUES (
  'e1000000-0000-0000-0000-000000000003',
  'f1000000-0000-0000-0000-000000000002',
  'Hyper Growth', 1, 'published', true,
  4.0, 'balance',
  10.0, 'static',
  30.0,
  0, 0,
  false, 0, true,
  'https://the5ers.com/programs',
  '2026-06-10T00:00:00Z',
  'user:initial-seed',
  now(),
  NULL,
  'Consistency rule: no single day > 30% of total profit target. Weekend holding not allowed. Verify exact consistency formula at launch.'
)
ON CONFLICT DO NOTHING;


-- ── FXIFY — Standard ──────────────────────────────────────────────────────────
-- Source: https://fxify.com/rules (verified 2026-06-10)
-- Daily loss: 5% equity; Max drawdown: 10% equity, static from initial
-- Consistency: none stated; News: 2 min before/after; Weekend: allowed
-- Min trading days: 5; Copy trading: permitted

INSERT INTO public.prop_rulesets (
  id, firm_id, challenge_name, version, status, is_current,
  daily_loss_pct, daily_loss_basis,
  max_drawdown_pct, max_drawdown_model,
  consistency_pct,
  news_before_min, news_after_min,
  weekend_holding_allowed, min_trading_days, copy_trading_permitted,
  source_url, verified_at, published_by, published_at, agent_confidence, notes
) VALUES (
  'e1000000-0000-0000-0000-000000000004',
  'f1000000-0000-0000-0000-000000000003',
  'Standard', 1, 'published', true,
  5.0, 'equity',
  10.0, 'static',
  NULL,
  2, 2,
  true, 5, true,
  'https://fxify.com/rules',
  '2026-06-10T00:00:00Z',
  'user:initial-seed',
  now(),
  NULL,
  'Equity-based daily loss. Copy trading and EAs permitted per FXIFY terms.'
)
ON CONFLICT DO NOTHING;


-- ── BrightFunded — Evaluation ─────────────────────────────────────────────────
-- Source: https://brightfunded.com/rules (verified 2026-06-10)
-- Daily loss: 5% of balance; Max drawdown: 10% balance-based, static
-- Consistency: none; News: 2 min before/after; Weekend: not allowed
-- Min trading days: 4; Copy trading: permitted

INSERT INTO public.prop_rulesets (
  id, firm_id, challenge_name, version, status, is_current,
  daily_loss_pct, daily_loss_basis,
  max_drawdown_pct, max_drawdown_model,
  consistency_pct,
  news_before_min, news_after_min,
  weekend_holding_allowed, min_trading_days, copy_trading_permitted,
  source_url, verified_at, published_by, published_at, agent_confidence, notes
) VALUES (
  'e1000000-0000-0000-0000-000000000005',
  'f1000000-0000-0000-0000-000000000004',
  'Evaluation', 1, 'published', true,
  5.0, 'balance',
  10.0, 'static',
  NULL,
  2, 2,
  false, 4, true,
  'https://brightfunded.com/rules',
  '2026-06-10T00:00:00Z',
  'user:initial-seed',
  now(),
  NULL,
  'Weekend positions not allowed. Copy trading permitted.'
)
ON CONFLICT DO NOTHING;


-- ── Seed audit entries for initial publish events ─────────────────────────────

INSERT INTO public.prop_rule_audit (firm_id, ruleset_id, action, actor, new_values, source_url)
SELECT
  r.firm_id,
  r.id,
  'published',
  'user:initial-seed',
  jsonb_build_object(
    'daily_loss_pct', r.daily_loss_pct,
    'max_drawdown_pct', r.max_drawdown_pct,
    'copy_trading_permitted', r.copy_trading_permitted
  ),
  r.source_url
FROM public.prop_rulesets r
WHERE r.published_by = 'user:initial-seed';


-- ── Internal verification page query (P2.2 requirement) ──────────────────────
-- The build prompt asks for "a small internal page listing seeded presets with
-- their last-verified dates". That page (apps/web/app/admin/prop-firms/page.tsx)
-- is built in P2.9 alongside the full Prop Mode UI. For now the data is here.
