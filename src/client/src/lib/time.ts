export const RANGES = {
  "1h": { label: "1 hour", ms: 3_600_000, bucket: 60 },
  "24h": { label: "24 hours", ms: 86_400_000, bucket: 3600 },
  "7d": { label: "7 days", ms: 7 * 86_400_000, bucket: 6 * 3600 },
  "30d": { label: "30 days", ms: 30 * 86_400_000, bucket: 86_400 },
} as const;

export type RangeKey = keyof typeof RANGES;

export type Scope = {
  projectId: string;
  range: RangeKey;
  from: number; // ms
  to: number; // ms
  bucket: number; // seconds
  env?: string;
};

type Search = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export function scopeFrom(projectId: string, search: Search): Scope {
  const key = (one(search.range) in RANGES ? one(search.range) : "24h") as RangeKey;
  const r = RANGES[key];
  // Snap "now" to the bucket edge so charts do not end on a sliver of a bucket.
  const to = Math.ceil(Date.now() / (r.bucket * 1000)) * r.bucket * 1000;
  return { projectId, range: key, from: to - r.ms, to, bucket: r.bucket, env: one(search.env) || undefined };
}

/** Query string that carries the scope to another page. */
export function carry(scope: Pick<Scope, "range" | "env">, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams();
  if (scope.range !== "24h") p.set("range", scope.range);
  if (scope.env) p.set("env", scope.env);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}
