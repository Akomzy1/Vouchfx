/**
 * Structured JSON logger for VouchFX workers and server code.
 *
 * Rules enforced here:
 * - NEVER log secrets: session strings, passwords, API keys, tokens, hashes.
 * - Output newline-delimited JSON (BetterStack/Logtail compatible).
 * - Each line: { ts, level, module, msg, [data] }
 */

// Keys matching this pattern are replaced with "[REDACTED]" before logging.
const SENSITIVE_KEY = /session_string|password|api_hash|api_key|secret|token|encryption_key|credential|authorization/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[DEPTH_LIMIT]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, module: string, msg: string, meta?: Record<string, unknown>) {
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    module,
    msg,
  };
  if (meta) line.data = redact(meta);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
  return {
    debug: (msg, meta) => emit("debug", module, msg, meta),
    info:  (msg, meta) => emit("info",  module, msg, meta),
    warn:  (msg, meta) => emit("warn",  module, msg, meta),
    error: (msg, meta) => emit("error", module, msg, meta),
  };
}
