/**
 * Rule Monitor agent — VCH-PROP-11/12.
 *
 * Scheduled job that runs on a configurable interval (default 24 h).
 * For each current published ruleset that has a source_url:
 *   1. Fetch the rules page (HTML → plain text).
 *   2. Pass to Claude (claude-sonnet-4-6) with a structured extraction tool.
 *   3. Diff extracted values against the stored ruleset.
 *   4a. If auto-publish eligible (all low-stakes fields + confidence ≥ 0.85):
 *       Insert agent_proposal + auto_published audit rows; publish new ruleset version.
 *   4b. Else if confidence ≥ PROPOSAL_CONFIDENCE_THRESHOLD:
 *       Insert agent_proposal row for human review.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TypedClient } from "@vouchfx/db";
import { publishPropRuleset } from "@vouchfx/db";
import { createLogger, isAutoPublishEligible, PROPOSAL_CONFIDENCE_THRESHOLD, notify } from "@vouchfx/core";

type Log = ReturnType<typeof createLogger>;

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = PROPOSAL_CONFIDENCE_THRESHOLD;
const MAX_CONTENT_CHARS = 8_000;
const FETCH_TIMEOUT_MS = 20_000;
// Default schedule: every 24 hours. Override via RULE_MONITOR_INTERVAL_MS env.
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Delay first run so the worker finishes startup before making external requests.
const FIRST_RUN_DELAY_MS = 30_000;

const MATERIAL_FIELDS = [
  "daily_loss_pct",
  "daily_loss_basis",
  "max_drawdown_pct",
  "max_drawdown_model",
  "consistency_pct",
  "news_before_min",
  "news_after_min",
  "weekend_holding_allowed",
  "min_trading_days",
  "copy_trading_permitted",
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MonitorDeps {
  db: TypedClient;
  anthropic: Anthropic;
  log: Log;
  resendApiKey?: string | null;
}

interface ExtractedRules {
  daily_loss_pct: number;
  daily_loss_basis: "equity" | "balance";
  max_drawdown_pct: number;
  max_drawdown_model: "static" | "eod_trailing" | "intraday_trailing";
  consistency_pct: number | null;
  news_before_min: number;
  news_after_min: number;
  weekend_holding_allowed: boolean;
  min_trading_days: number;
  copy_trading_permitted: boolean;
  confidence: number;
  reasoning: string;
}

type StoredRuleset = {
  id: string;
  firm_id: string;
  challenge_name: string;
  version: number;
  source_url: string;
  daily_loss_pct: number;
  daily_loss_basis: string;
  max_drawdown_pct: number;
  max_drawdown_model: string;
  consistency_pct: number | null;
  news_before_min: number;
  news_after_min: number;
  weekend_holding_allowed: boolean;
  min_trading_days: number;
  copy_trading_permitted: boolean;
  prop_firms: { name: string } | null;
};

// ── Claude extraction tool ────────────────────────────────────────────────────

const EXTRACTION_TOOL: Anthropic.Messages.Tool = {
  name: "extract_prop_rules",
  description:
    "Extract trading rule values from a prop firm's official rules page text. " +
    "Base extraction ONLY on text provided. Return null for any rule not mentioned.",
  input_schema: {
    type: "object" as const,
    properties: {
      daily_loss_pct: {
        type: "number",
        description: "Max daily loss as a percentage (e.g. 5 for 5%)",
      },
      daily_loss_basis: {
        type: "string",
        enum: ["equity", "balance"],
        description: "Whether the daily loss limit applies to equity or balance",
      },
      max_drawdown_pct: {
        type: "number",
        description: "Max total drawdown as a percentage",
      },
      max_drawdown_model: {
        type: "string",
        enum: ["static", "eod_trailing", "intraday_trailing"],
        description:
          "How the drawdown floor is calculated: static=from initial balance, " +
          "eod_trailing=from end-of-day peak, intraday_trailing=from intraday peak",
      },
      consistency_pct: {
        description:
          "Max profit in one day as % of total period profit. Null if no consistency rule stated.",
        anyOf: [{ type: "number" }, { type: "null" }],
      },
      news_before_min: {
        type: "integer",
        description: "Minutes before high-impact news events to pause trading (0 if not stated)",
      },
      news_after_min: {
        type: "integer",
        description: "Minutes after high-impact news events to resume trading (0 if not stated)",
      },
      weekend_holding_allowed: {
        type: "boolean",
        description: "Whether open positions may be held over the weekend",
      },
      min_trading_days: {
        type: "integer",
        description: "Minimum number of trading days required to pass the challenge (0 if not stated)",
      },
      copy_trading_permitted: {
        type: "boolean",
        description:
          "Whether copy trading, EAs, and automated copying tools are explicitly permitted",
      },
      confidence: {
        type: "number",
        description: "Your extraction confidence from 0.0 to 1.0",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of what you found and any uncertainties",
      },
    },
    required: [
      "daily_loss_pct",
      "daily_loss_basis",
      "max_drawdown_pct",
      "max_drawdown_model",
      "consistency_pct",
      "news_before_min",
      "news_after_min",
      "weekend_holding_allowed",
      "min_trading_days",
      "copy_trading_permitted",
      "confidence",
      "reasoning",
    ],
  },
};

// ── HTML → plain text ─────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|h[1-6]|tr|td|th)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, "\n")
    .trim();
}

// ── Fetch with timeout ────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "VouchFX-RuleMonitor/1.0 (+https://vouchfx.com/compliance-check)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── Extraction ────────────────────────────────────────────────────────────────

async function extractRules(
  anthropic: Anthropic,
  firmName: string,
  challengeName: string,
  pageText: string,
): Promise<ExtractedRules | null> {
  const content = pageText.slice(0, MAX_CONTENT_CHARS);

  const systemPrompt =
    `You are extracting trading rules for the "${challengeName}" challenge from ${firmName}'s ` +
    `official rules page. Extract ONLY what is explicitly stated in the text. ` +
    `Do not infer, estimate, or fill gaps with industry norms. ` +
    `If a rule is not mentioned, use null (for consistency_pct) or 0 (for news windows / min days).`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: `Rules page text:\n\n${content}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) return null;

  return toolUse.input as ExtractedRules;
}

// ── Diff ──────────────────────────────────────────────────────────────────────

function diffRules(
  stored: StoredRuleset,
  extracted: ExtractedRules,
): { changed: boolean; oldValues: Record<string, unknown>; newValues: Record<string, unknown> } {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const field of MATERIAL_FIELDS) {
    const storedVal = stored[field as keyof StoredRuleset];
    const extractedVal = extracted[field as keyof ExtractedRules];

    // Numeric comparison: normalise to 3 dp to avoid float noise
    const normStored =
      typeof storedVal === "number"
        ? parseFloat(storedVal.toFixed(3))
        : storedVal;
    const normExtracted =
      typeof extractedVal === "number"
        ? parseFloat((extractedVal as number).toFixed(3))
        : extractedVal;

    if (normStored !== normExtracted) {
      oldValues[field] = storedVal;
      newValues[field] = extractedVal;
    }
  }

  return {
    changed: Object.keys(newValues).length > 0,
    oldValues,
    newValues,
  };
}

// ── Notification helpers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyApprovers(dbAny: any, firmName: string, challengeName: string, fieldCount: number, deps: MonitorDeps): Promise<void> {
  const { log, resendApiKey } = deps;
  try {
    const { data: roles } = await dbAny
      .from("user_roles")
      .select("user_id")
      .eq("role", "rule_approver");

    const ids = ((roles ?? []) as { user_id: string }[]).map((r) => r.user_id);
    if (ids.length === 0) return;

    const { data: users } = await dbAny
      .from("users")
      .select("id, email")
      .in("id", ids);

    for (const u of (users ?? []) as { id: string; email: string }[]) {
      await notify(dbAny, {
        userId: u.id,
        toEmail: u.email,
        event: "prop_rule_proposal",
        title: `Rule change detected — ${firmName} ${challengeName}`,
        body: `${fieldCount} field${fieldCount !== 1 ? "s" : ""} changed. Review in the approval queue.`,
        resendApiKey: resendApiKey ?? null,
      });
    }
  } catch (err) {
    log.error("[rule-monitor] approver notification failed", { error: (err as Error).message });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyAffectedPropUsers(dbAny: any, oldRulesetId: string, firmName: string, challengeName: string, deps: MonitorDeps): Promise<void> {
  const { log, resendApiKey } = deps;
  try {
    const { data: profiles } = await dbAny
      .from("prop_account_profiles")
      .select("user_id")
      .eq("ruleset_id", oldRulesetId)
      .eq("enabled", true);

    const ids = [...new Set(((profiles ?? []) as { user_id: string }[]).map((p) => p.user_id))];
    if (ids.length === 0) return;

    const { data: users } = await dbAny
      .from("users")
      .select("id, email")
      .in("id", ids);

    for (const u of (users ?? []) as { id: string; email: string }[]) {
      await notify(dbAny, {
        userId: u.id,
        toEmail: u.email,
        event: "prop_rule_published",
        title: `Prop rules updated — ${firmName} ${challengeName}`,
        body: "A rule update was published for your challenge. Review your Prop Mode settings.",
        resendApiKey: resendApiKey ?? null,
      });
    }
  } catch (err) {
    log.error("[rule-monitor] user notification failed", { error: (err as Error).message });
  }
}

// ── Single scan cycle ─────────────────────────────────────────────────────────

export async function runRuleMonitor(deps: MonitorDeps): Promise<void> {
  const { db, anthropic, log } = deps;

  log.info("[rule-monitor] starting scan cycle");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;

  const { data: rulesets, error: fetchErr } = await dbAny
    .from("prop_rulesets")
    .select(
      `id, firm_id, challenge_name, version, source_url,
       daily_loss_pct, daily_loss_basis, max_drawdown_pct, max_drawdown_model,
       consistency_pct, news_before_min, news_after_min,
       weekend_holding_allowed, min_trading_days, copy_trading_permitted,
       prop_firms(name)`,
    )
    .eq("is_current", true)
    .not("source_url", "is", null);

  if (fetchErr) {
    log.error("[rule-monitor] failed to fetch rulesets", { error: fetchErr.message });
    return;
  }

  const targets = (rulesets ?? []) as StoredRuleset[];
  log.info("[rule-monitor] targets loaded", { count: targets.length });

  for (const ruleset of targets) {
    const firmName = ruleset.prop_firms?.name ?? ruleset.firm_id;
    const label = `${firmName} / ${ruleset.challenge_name}`;

    try {
      // ── 1. Fetch page ───────────────────────────────────────────────────────
      log.info("[rule-monitor] fetching", { label, url: ruleset.source_url });
      const html = await fetchText(ruleset.source_url);
      const pageText = stripHtml(html);

      if (pageText.length < 200) {
        log.warn("[rule-monitor] page too short, skipping", { label, length: pageText.length });
        continue;
      }

      // ── 2. Extract with Claude ──────────────────────────────────────────────
      const extracted = await extractRules(
        anthropic,
        firmName,
        ruleset.challenge_name,
        pageText,
      );

      if (!extracted) {
        log.warn("[rule-monitor] extraction returned no tool call", { label });
        continue;
      }

      log.info("[rule-monitor] extracted", {
        label,
        confidence: extracted.confidence,
        reasoning: extracted.reasoning,
      });

      // ── 3. Confidence gate ─────────────────────────────────────────────────
      if (extracted.confidence < CONFIDENCE_THRESHOLD) {
        log.info("[rule-monitor] confidence below threshold, skipping proposal", {
          label,
          confidence: extracted.confidence,
          threshold: CONFIDENCE_THRESHOLD,
        });
        continue;
      }

      // ── 4. Diff ─────────────────────────────────────────────────────────────
      const { changed, oldValues, newValues } = diffRules(ruleset, extracted);

      if (!changed) {
        log.info("[rule-monitor] no changes detected", { label });
        continue;
      }

      const changedFields = Object.keys(newValues);
      const confidence = parseFloat(extracted.confidence.toFixed(3));
      const autoPublish = isAutoPublishEligible(changedFields, confidence);

      log.info("[rule-monitor] changes detected", {
        label,
        changedFields,
        confidence,
        autoPublish,
      });

      // ── 5. Insert agent_proposal audit row ──────────────────────────────────
      const { data: proposalRow, error: auditErr } = await dbAny
        .from("prop_rule_audit")
        .insert({
          firm_id: ruleset.firm_id,
          ruleset_id: ruleset.id,
          action: "agent_proposal",
          actor: "agent:auto",
          old_values: oldValues,
          new_values: { ...newValues, _reasoning: extracted.reasoning },
          source_url: ruleset.source_url,
          agent_confidence: confidence,
        })
        .select("id")
        .single();

      if (auditErr || !proposalRow) {
        log.error("[rule-monitor] failed to write proposal row", {
          label,
          error: auditErr?.message,
        });
        continue;
      }

      // ── 6. Auto-publish or notify approvers ────────────────────────────────
      if (autoPublish) {
        log.info("[rule-monitor] auto-publishing low-stakes changes", { label });
        try {
          const newRulesetId = await publishPropRuleset({
            db: dbAny,
            proposalId: proposalRow.id as string,
            currentRulesetId: ruleset.id,
            newValues,
            action: "auto_published",
            publishedBy: "agent:auto",
            sourceUrl: ruleset.source_url,
            agentConfidence: confidence,
          });
          log.info("[rule-monitor] auto-published", { label, newRulesetId });
          // Notify users whose prop profile references the old ruleset
          await notifyAffectedPropUsers(dbAny, ruleset.id, firmName, ruleset.challenge_name, deps);
        } catch (pubErr) {
          log.error("[rule-monitor] auto-publish failed", {
            label,
            error: (pubErr as Error).message,
          });
        }
      } else {
        log.info("[rule-monitor] proposal queued for human review", { label });
        // Notify approvers that a new proposal awaits review
        await notifyApprovers(dbAny, firmName, ruleset.challenge_name, changedFields.length, deps);
      }
    } catch (err) {
      // Non-fatal: log and continue to the next ruleset.
      log.error("[rule-monitor] error processing ruleset", {
        label,
        error: (err as Error).message,
      });
    }
  }

  log.info("[rule-monitor] scan cycle complete");
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Start the Rule Monitor on a schedule.
 *
 * Runs once after FIRST_RUN_DELAY_MS, then every `intervalMs`.
 * Returns a stop function for graceful shutdown.
 */
export function startRuleMonitorSchedule(
  deps: MonitorDeps,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): () => void {
  const { log } = deps;

  log.info("[rule-monitor] schedule starting", {
    firstRunDelayMs: FIRST_RUN_DELAY_MS,
    intervalMs,
  });

  const safeRun = () => {
    runRuleMonitor(deps).catch((err) => {
      log.error("[rule-monitor] unhandled error in cycle", {
        error: (err as Error).message,
      });
    });
  };

  const firstRun = setTimeout(safeRun, FIRST_RUN_DELAY_MS);
  const recurring = setInterval(safeRun, intervalMs);

  return () => {
    clearTimeout(firstRun);
    clearInterval(recurring);
    log.info("[rule-monitor] schedule stopped");
  };
}
