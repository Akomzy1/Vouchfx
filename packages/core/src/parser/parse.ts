import type Anthropic from "@anthropic-ai/sdk";
import { MODELS, CONFIDENCE_THRESHOLD } from "@vouchfx/config";
import { ParsedSignalSchema, type ParsedSignal } from "../types/signal";
import { SYSTEM_PROMPT } from "./system-prompt";
import { PARSE_SIGNAL_TOOL } from "./tool-schema";

export interface ParseOptions {
  /** Override the model. Defaults to MODELS.default (Haiku). */
  model?: string;
  /** Base64 JPEG from a Telegram photo. Forces Sonnet and vision-mode content. */
  imageBase64?: string;
}

/**
 * Context from the original signal for use when parsing an edited message.
 * Injected into the user prompt so the model can classify the edit correctly
 * (e.g. MODIFY_SL vs CANCEL_PENDING vs a fresh replacement signal).
 */
export interface PriorSignalContext {
  symbol: string | null;
  side: string | null;
  entries: number[];
  sl: number | null;
  tps: number[];
  /** First 300 chars of the original raw message, for additional context. */
  rawText: string | null;
}

/**
 * Parse a raw Telegram signal text into a validated ParsedSignal.
 *
 * Uses tool-use structured output so the model MUST call parse_signal.
 * The system prompt + tool definition are sent with cache_control: ephemeral
 * so they are cached server-side after the first invocation.
 *
 * @throws If the model doesn't return a tool_use block, or zod validation fails.
 */
export async function parseSignal(
  client: Anthropic,
  rawText: string,
  options: ParseOptions = {}
): Promise<ParsedSignal> {
  const { imageBase64 } = options;
  // Vision requires Sonnet; default stays Haiku for text-only messages.
  const model = options.model ?? (imageBase64 ? MODELS.fallback : MODELS.default);

  // Build user content: multimodal (image + text) when a photo is present,
  // plain string otherwise.
  const userContent: Anthropic.MessageParam["content"] = imageBase64
    ? [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/jpeg" as const,
            data: imageBase64,
          },
        },
        {
          type: "text" as const,
          text: rawText || "[Image-only signal — extract trade details from the screenshot above]",
        },
      ]
    : rawText;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [PARSE_SIGNAL_TOOL],
    tool_choice: { type: "tool", name: "parse_signal" },
    messages: [{ role: "user", content: userContent }],
  });

  // The model is forced to call parse_signal via tool_choice; find that block.
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUseBlock) {
    throw new Error(
      `[parser] model ${model} did not return a tool_use block. stop_reason=${response.stop_reason}`
    );
  }

  // Validate the tool input against the canonical schema.
  const result = ParsedSignalSchema.safeParse(toolUseBlock.input);
  if (!result.success) {
    throw new Error(
      `[parser] tool output failed zod validation: ${result.error.message}\ninput=${JSON.stringify(toolUseBlock.input)}`
    );
  }

  return result.data;
}

/**
 * Parse with automatic model escalation (P1.7+).
 *
 * Routing logic (matches CLAUDE.md §5 and signal-parsing skill):
 *   • Edits (priorSignal provided) → Sonnet directly; prior signal fields are
 *     injected into the prompt so the model can classify correctly.
 *   • Fresh signals → Haiku first; if confidence < CONFIDENCE_THRESHOLD,
 *     escalate to Sonnet.
 *
 * Returns both the result and the model that produced it, for audit logging.
 */
export async function parseSignalWithEscalation(
  client: Anthropic,
  rawText: string,
  priorSignal?: PriorSignalContext,
  imageBase64?: string
): Promise<{ signal: ParsedSignal; modelUsed: string }> {
  // ── Vision: image present → Sonnet with multimodal content ───────────────
  // Per CLAUDE.md §5: Sonnet is used "when … an image is attached".
  if (imageBase64) {
    const text = priorSignal ? buildContextualPrompt(rawText, priorSignal) : rawText;
    const signal = await parseSignal(client, text, { model: MODELS.fallback, imageBase64 });
    return { signal, modelUsed: MODELS.fallback };
  }

  // ── Edit / follow-up: inject context, go straight to Sonnet ──────────────
  if (priorSignal) {
    const contextualText = buildContextualPrompt(rawText, priorSignal);
    const signal = await parseSignal(client, contextualText, { model: MODELS.fallback });
    return { signal, modelUsed: MODELS.fallback };
  }

  // ── Fresh text signal: try Haiku first ───────────────────────────────────
  const haiku = await parseSignal(client, rawText, { model: MODELS.default });
  if (haiku.confidence >= CONFIDENCE_THRESHOLD) {
    return { signal: haiku, modelUsed: MODELS.default };
  }

  // ── Confidence below threshold: escalate to Sonnet ────────────────────────
  const sonnet = await parseSignal(client, rawText, { model: MODELS.fallback });
  return { signal: sonnet, modelUsed: MODELS.fallback };
}

/**
 * Prepend a structured prior-signal context block to the edited message text.
 * The system prompt already instructs the model how to use this for follow-up
 * classification (MODIFY_SL, CANCEL_PENDING, NEW_SIGNAL, etc.).
 */
function buildContextualPrompt(editedText: string, prior: PriorSignalContext): string {
  const lines: string[] = ["[PRIOR SIGNAL — this message is an edit of the signal below]"];
  if (prior.symbol) lines.push(`Symbol: ${prior.symbol}`);
  if (prior.side) lines.push(`Direction: ${prior.side}`);
  if (prior.entries.length) lines.push(`Entries: ${prior.entries.join(", ")}`);
  if (prior.sl != null) lines.push(`SL: ${prior.sl}`);
  if (prior.tps.length) lines.push(`TPs: ${prior.tps.join(", ")}`);
  if (prior.rawText) lines.push(`Original text: ${prior.rawText.slice(0, 300)}`);
  lines.push("", "[EDITED TEXT — classify relative to the prior signal above]");
  lines.push(editedText);
  return lines.join("\n");
}
