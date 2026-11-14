export function usd(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  if (opts.compact && abs >= 1000) return "$" + compact(n);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) return "$" + n.toFixed(4);
  if (abs < 1) return "$" + n.toFixed(3);
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1e4) return (n / 1e3).toFixed(0) + "K";
  if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toLocaleString("en-US");
}

export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

const UTC: Intl.DateTimeFormatOptions = { timeZone: "UTC" };

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { ...UTC, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " UTC";
}

export function tick(ms: number, bucketSeconds: number): string {
  const d = new Date(ms);
  if (bucketSeconds >= 86_400) return d.toLocaleString("en-GB", { ...UTC, day: "numeric", month: "short" });
  if (bucketSeconds >= 6 * 3600) return d.toLocaleString("en-GB", { ...UTC, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("en-GB", { ...UTC, hour: "2-digit", minute: "2-digit" });
}

export function ago(ms: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}
