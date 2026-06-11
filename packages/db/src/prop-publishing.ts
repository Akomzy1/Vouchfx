/**
 * publishPropRuleset — atomic-ish publish of a new prop ruleset version.
 *
 * Used by both:
 *   - apps/web API routes (human approval flow)
 *   - apps/executor rule-monitor (auto-publish flow)
 *
 * Requires a service-role Supabase client (bypasses RLS to update prop_rulesets).
 *
 * Steps (in order to satisfy the partial unique index):
 *   1. Load current ruleset to get all existing field values.
 *   2. SET old row is_current = false (frees the unique slot).
 *   3. INSERT new row with merged values, version + 1, is_current = true.
 *   4. INSERT prop_rule_audit row (action = 'approved' | 'auto_published').
 *
 * Returns the new ruleset ID.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PublishParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>;
  /** The prop_rule_audit.id of the agent_proposal being actioned. */
  proposalId: string;
  /** The CURRENT (existing) ruleset row id whose values are being updated. */
  currentRulesetId: string;
  /** Merged field values to apply on top of the current ruleset. */
  newValues: Record<string, unknown>;
  /** 'approved' = human approver; 'auto_published' = rule monitor. */
  action: "approved" | "auto_published";
  /** 'agent:auto' | 'user:<email>' */
  publishedBy: string;
  sourceUrl?: string | null;
  agentConfidence?: number | null;
}

export async function publishPropRuleset(params: PublishParams): Promise<string> {
  const {
    db,
    proposalId,
    currentRulesetId,
    newValues,
    action,
    publishedBy,
    sourceUrl,
    agentConfidence,
  } = params;

  // ── 1. Load current ruleset ───────────────────────────────────────────────
  const { data: current, error: loadErr } = await db
    .from("prop_rulesets")
    .select("*")
    .eq("id", currentRulesetId)
    .single();

  if (loadErr || !current) {
    throw new Error(
      `publishPropRuleset: failed to load ruleset ${currentRulesetId}: ${loadErr?.message ?? "not found"}`,
    );
  }

  // ── 2. Flip old row to is_current = false ─────────────────────────────────
  const { error: flipErr } = await db
    .from("prop_rulesets")
    .update({ is_current: false })
    .eq("id", currentRulesetId);

  if (flipErr) {
    throw new Error(`publishPropRuleset: failed to unset is_current: ${flipErr.message}`);
  }

  // ── 3. Insert new version ─────────────────────────────────────────────────
  const newRow = {
    firm_id:                current.firm_id,
    challenge_name:         current.challenge_name,
    version:                (current.version as number) + 1,
    status:                 "published",
    is_current:             true,
    // Core risk fields — merged from current + overrides
    daily_loss_pct:         newValues.daily_loss_pct        ?? current.daily_loss_pct,
    daily_loss_basis:       newValues.daily_loss_basis      ?? current.daily_loss_basis,
    max_drawdown_pct:       newValues.max_drawdown_pct      ?? current.max_drawdown_pct,
    max_drawdown_model:     newValues.max_drawdown_model    ?? current.max_drawdown_model,
    consistency_pct:        Object.prototype.hasOwnProperty.call(newValues, "consistency_pct")
                              ? newValues.consistency_pct
                              : current.consistency_pct,
    news_before_min:        newValues.news_before_min       ?? current.news_before_min,
    news_after_min:         newValues.news_after_min        ?? current.news_after_min,
    weekend_holding_allowed: newValues.weekend_holding_allowed ?? current.weekend_holding_allowed,
    min_trading_days:       newValues.min_trading_days      ?? current.min_trading_days,
    copy_trading_permitted: newValues.copy_trading_permitted ?? current.copy_trading_permitted,
    // Provenance
    source_url:    sourceUrl ?? current.source_url,
    verified_at:   new Date().toISOString(),
    published_by:  publishedBy,
    published_at:  new Date().toISOString(),
    agent_confidence: agentConfidence ?? null,
    notes:         current.notes,
  };

  const { data: inserted, error: insertErr } = await db
    .from("prop_rulesets")
    .insert(newRow)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // Rollback: re-enable old row to maintain consistency
    await db
      .from("prop_rulesets")
      .update({ is_current: true })
      .eq("id", currentRulesetId);
    throw new Error(`publishPropRuleset: failed to insert new ruleset: ${insertErr?.message}`);
  }

  const newRulesetId = inserted.id as string;

  // ── 4. Audit row ─────────────────────────────────────────────────────────
  const { error: auditErr } = await db.from("prop_rule_audit").insert({
    firm_id:          current.firm_id,
    ruleset_id:       newRulesetId,
    proposal_id:      proposalId,
    action,
    actor:            publishedBy,
    old_values: {
      daily_loss_pct:          current.daily_loss_pct,
      daily_loss_basis:        current.daily_loss_basis,
      max_drawdown_pct:        current.max_drawdown_pct,
      max_drawdown_model:      current.max_drawdown_model,
      consistency_pct:         current.consistency_pct,
      news_before_min:         current.news_before_min,
      news_after_min:          current.news_after_min,
      weekend_holding_allowed: current.weekend_holding_allowed,
      min_trading_days:        current.min_trading_days,
      copy_trading_permitted:  current.copy_trading_permitted,
    },
    new_values: newValues,
    source_url:       sourceUrl ?? current.source_url,
    agent_confidence: agentConfidence ?? null,
  });

  if (auditErr) {
    // Non-fatal: ruleset was published successfully; just log.
    console.error("[prop-publishing] audit row failed", { auditErr });
  }

  return newRulesetId;
}

// ── rollbackPropRuleset ───────────────────────────────────────────────────────

export interface RollbackParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>;
  /** The historical version whose values will be restored (values are copied into a new row). */
  targetRulesetId: string;
  /** Must be is_current = true for the same firm/challenge. Will become is_current = false, status = 'rolled_back'. */
  currentRulesetId: string;
  /** 'user:<email>' */
  rolledBackBy: string;
}

/**
 * Rolls back to a previous ruleset version by:
 *   1. Deactivating the current version (is_current=false, status='rolled_back').
 *   2. Inserting a new row that copies the target's rule values (version = current.version + 1).
 *   3. Writing a 'rollback_applied' audit row.
 *
 * Requires a service-role client.
 * Returns the new ruleset ID.
 */
export async function rollbackPropRuleset(params: RollbackParams): Promise<string> {
  const { db, targetRulesetId, currentRulesetId, rolledBackBy } = params;

  // 1. Load both rulesets in parallel
  const [{ data: current, error: curErr }, { data: target, error: tgtErr }] = await Promise.all([
    db.from("prop_rulesets").select("*").eq("id", currentRulesetId).single(),
    db.from("prop_rulesets").select("*").eq("id", targetRulesetId).single(),
  ]);

  if (curErr || !current)
    throw new Error(`rollbackPropRuleset: current not found: ${curErr?.message ?? "not found"}`);
  if (tgtErr || !target)
    throw new Error(`rollbackPropRuleset: target not found: ${tgtErr?.message ?? "not found"}`);

  if (current.firm_id !== target.firm_id || current.challenge_name !== target.challenge_name)
    throw new Error("rollbackPropRuleset: target and current belong to different firm/challenge");
  if (!current.is_current)
    throw new Error("rollbackPropRuleset: currentRulesetId is not the active version");

  // 2. Deactivate current version
  const { error: flipErr } = await db
    .from("prop_rulesets")
    .update({ is_current: false, status: "rolled_back" })
    .eq("id", currentRulesetId);

  if (flipErr)
    throw new Error(`rollbackPropRuleset: failed to deactivate current: ${flipErr.message}`);

  // 3. Insert new version copying target's rule values
  const newRow = {
    firm_id:                 current.firm_id,
    challenge_name:          current.challenge_name,
    version:                 (current.version as number) + 1,
    status:                  "published",
    is_current:              true,
    daily_loss_pct:          target.daily_loss_pct,
    daily_loss_basis:        target.daily_loss_basis,
    max_drawdown_pct:        target.max_drawdown_pct,
    max_drawdown_model:      target.max_drawdown_model,
    consistency_pct:         target.consistency_pct,
    news_before_min:         target.news_before_min,
    news_after_min:          target.news_after_min,
    weekend_holding_allowed: target.weekend_holding_allowed,
    min_trading_days:        target.min_trading_days,
    copy_trading_permitted:  target.copy_trading_permitted,
    source_url:              target.source_url,
    verified_at:             new Date().toISOString(),
    published_by:            rolledBackBy,
    published_at:            new Date().toISOString(),
    agent_confidence:        null as number | null,
    notes:                   target.notes,
  };

  const { data: inserted, error: insertErr } = await db
    .from("prop_rulesets")
    .insert(newRow)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // Restore current on failure
    await db.from("prop_rulesets")
      .update({ is_current: true, status: "published" })
      .eq("id", currentRulesetId);
    throw new Error(`rollbackPropRuleset: insert failed: ${insertErr?.message}`);
  }

  const newRulesetId = inserted.id as string;

  // 4. Audit row
  const pickRules = (r: Record<string, unknown>) => ({
    daily_loss_pct:          r.daily_loss_pct,
    daily_loss_basis:        r.daily_loss_basis,
    max_drawdown_pct:        r.max_drawdown_pct,
    max_drawdown_model:      r.max_drawdown_model,
    consistency_pct:         r.consistency_pct,
    news_before_min:         r.news_before_min,
    news_after_min:          r.news_after_min,
    weekend_holding_allowed: r.weekend_holding_allowed,
    min_trading_days:        r.min_trading_days,
    copy_trading_permitted:  r.copy_trading_permitted,
  });

  await db.from("prop_rule_audit").insert({
    firm_id:          current.firm_id,
    ruleset_id:       newRulesetId,
    action:           "rollback_applied",
    actor:            rolledBackBy,
    old_values:       pickRules(current as Record<string, unknown>),
    new_values:       pickRules(target as Record<string, unknown>),
    source_url:       target.source_url,
    agent_confidence: null,
  });

  return newRulesetId;
}
