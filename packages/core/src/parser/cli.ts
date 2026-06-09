/**
 * CLI: parse a raw signal string and print the structured result.
 *
 * Usage (text passed as argument):
 *   pnpm --filter @vouchfx/core parse "GOLD BUY 3000 SL 2980 TP 3030 3050"
 *
 * Usage (text piped via stdin):
 *   echo "XAUUSD SELL @ 3050, SL 3070, TP 3020 3000" | pnpm --filter @vouchfx/core parse
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createInterface } from "readline/promises";
import { stdin } from "process";
import { parseSignal } from "./parse";

(async () => {
  // Read signal text from argv or stdin
  let rawText = process.argv.slice(2).join(" ").trim();

  if (!rawText) {
    // Nothing on argv — read from stdin (allows piping)
    if (stdin.isTTY) {
      process.stdout.write("Paste a signal (press Enter then Ctrl+D when done):\n> ");
    }
    const rl = createInterface({ input: stdin });
    const lines: string[] = [];
    for await (const line of rl) {
      lines.push(line);
    }
    rawText = lines.join("\n").trim();
  }

  if (!rawText) {
    console.error("Error: no signal text provided.\n  Usage: pnpm --filter @vouchfx/core parse \"<signal text>\"");
    process.exit(1);
  }

  const client = new Anthropic();

  console.log("\n─── Input ────────────────────────────────────────");
  console.log(rawText);
  console.log("─── Parsing... ────────────────────────────────────\n");

  const start = Date.now();
  const result = await parseSignal(client, rawText);
  const ms = Date.now() - start;

  console.log("─── Result ────────────────────────────────────────");
  console.log(JSON.stringify(result, null, 2));
  console.log(`\n─── Done in ${ms}ms ─────────────────────────────────`);
  console.log(`  is_signal  : ${result.is_signal}`);
  console.log(`  symbol     : ${result.symbol ?? "(none)"}`);
  console.log(`  side       : ${result.side ?? "(none)"}`);
  console.log(`  confidence : ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`  reasoning  : ${result.reasoning}`);
})().catch((err: unknown) => {
  console.error("[parser-cli] fatal:", err);
  process.exit(1);
});
