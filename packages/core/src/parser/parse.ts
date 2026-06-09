import type Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@vouchfx/config";
import { ParsedSignalSchema, type ParsedSignal } from "../types/signal";
import { SYSTEM_PROMPT } from "./system-prompt";
import { PARSE_SIGNAL_TOOL } from "./tool-schema";

export interface ParseOptions {
  /** Override the model. Defaults to MODELS.default (Haiku). No escalation in P0.3 — that is P1.7. */
  model?: string;
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
  const model = options.model ?? MODELS.default;

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
    messages: [{ role: "user", content: rawText }],
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
