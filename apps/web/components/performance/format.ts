// Formatting helpers for the Performance surface. Money in monospace tabular
// figures; green/red reserved for P&L only (applied by the caller).

export function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function signed(n: number): string {
  const sign = n < 0 ? "−" : "+";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact signed money for tight calendar cells (e.g. +$1.2k / −$340). */
export function signedCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "+";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Profit factor: null = no losses (undefined ratio) → ∞. */
export function profitFactorText(pf: number | null): string {
  if (pf === null) return "∞";
  return pf.toFixed(2);
}

export function lots(n: number): string {
  return n.toFixed(2);
}

export function price(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

export function toneClass(n: number): string {
  return n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-text-secondary";
}
