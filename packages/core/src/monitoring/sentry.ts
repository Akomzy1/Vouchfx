/**
 * Optional Sentry integration — no-ops when SENTRY_DSN is absent.
 *
 * We use a dynamic require so @sentry/node is not a hard dependency of
 * packages/core; it only needs to be installed in the consuming app.
 *
 * NEVER pass session strings, passwords, or raw credentials into extras —
 * the logger's redact() filter covers known keys, but Sentry extras are
 * user-supplied and must be scrubbed before calling captureException.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sentry: any | null = null;

export function initSentry(dsn: string | undefined, release?: string): void {
  if (!dsn) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    _sentry = require("@sentry/node") as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_sentry as any).init({
      dsn,
      release,
      environment: process.env.NODE_ENV ?? "development",
      beforeBreadcrumb: () => null,   // never capture request breadcrumbs
      tracesSampleRate: 0.1,
    });
  } catch {
    // @sentry/node not installed in this environment — silently skip.
    _sentry = null;
  }
}

export function captureException(err: unknown, extras?: Record<string, unknown>): void {
  if (!_sentry) return;
  _sentry.withScope((scope: { setExtras: (e: Record<string, unknown>) => void }) => {
    if (extras) scope.setExtras(extras);
    _sentry.captureException(err);
  });
}

export function captureMessage(msg: string, level: "info" | "warning" | "error" = "info"): void {
  if (!_sentry) return;
  _sentry.captureMessage(msg, level);
}
