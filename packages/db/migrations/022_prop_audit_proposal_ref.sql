-- =============================================================================
-- VouchFX — Migration 022 · Prop rule audit proposal reference (Phase 2, P2.11)
--
-- Adds proposal_id to prop_rule_audit so approval/rejection rows can reference
-- the agent_proposal row they are responding to.
--
-- This makes "pending proposals" queryable: a proposal is pending if no
-- approved/rejected/auto_published row references its id via proposal_id.
--
-- Nullable FK — initial (published/rolled_back/etc) rows have no proposal reference.
-- =============================================================================

ALTER TABLE public.prop_rule_audit
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES public.prop_rule_audit(id);
