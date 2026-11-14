import { query, SPANS, type Params } from "./clickhouse";
import { duration, pct, usd } from "./format";

/**
 * Anomaly detection over hourly buckets.
 *
 * Each hour is compared with the 7 days before it using a robust z-score
 * (median and MAD), which tolerates the spikes it is trying to find better
 * than mean and standard deviation do. Consecutive flagged hours merge into
 * one incident, and each incident gets a plain-language summary naming the
 * model, service, or user that contributed most.
 */

const HOUR = 3_600_000;
const BASELINE_HOURS = 168;
const MIN_BASELINE_POINTS = 24;
const Z_THRESHOLD = 3.5;

export type Metric = "cost" | "latency" | "errors";
export type Incident = {
  id: string;
  metric: Metric;
  severity: "warning" | "critical";
  start: number;
  end: number; // exclusive
  peak: number;
  baseline: number;
  ratio: number;
  title: string;
  summary: string;
  contributor?: { dimension: string; value: string; share: number };
  ongoing: boolean;
};

export type HourPoint = { t: number; cost: number; latency: number; errors: number; requests: number; flags: Metric[] };

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * A flagged hour must also clear the baseline's own busy hours (a multiple of
 * its 95th percentile) by a minimum absolute amount. Bursty traffic has a tiny
 * MAD, so the z-score alone would flag every ordinary peak.
 */
const FLOORS: Record<Metric, { overP95: number; absolute: number }> = {
  cost: { overP95: 2, absolute: 0.05 }, // 2x a normal busy hour and +$0.05/h
  latency: { overP95: 1.5, absolute: 500 }, // 1.5x a normal slow hour and +500 ms
  errors: { overP95: 2, absolute: 0.05 }, // 2x a normal bad hour and +5 points
};

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
}

export function detect(values: number[], metric: Metric, valid: boolean[] = []): { flagged: boolean; baseline: number }[] {
  return values.map((x, i) => {
    const history = values.slice(Math.max(0, i - BASELINE_HOURS), i).filter((_, j) => valid[Math.max(0, i - BASELINE_HOURS) + j] !== false);
    if (history.length < MIN_BASELINE_POINTS || valid[i] === false) return { flagged: false, baseline: 0 };
    const med = median(history);
    const mad = median(history.map((h) => Math.abs(h - med))) * 1.4826;
    const floor = FLOORS[metric];
    const flagged = x > med + Z_THRESHOLD * mad && x >= percentile(history, 0.95) * floor.overP95 && x - med >= floor.absolute;
    return { flagged, baseline: med };
  });
}

const LLM = "span_type IN ('llm', 'embedding')";

export async function hourly(projectId: string, from: number, to: number, env?: string): Promise<HourPoint[]> {
  const start = Math.floor(from / HOUR) * HOUR - BASELINE_HOURS * HOUR;
  const end = Math.ceil(to / HOUR) * HOUR;
  const params: Params = { pid: projectId, from: start, to: end };
  if (env) params.env = env;
  const rows = await query<Record<string, unknown>>(
    `SELECT toUnixTimestamp(toStartOfHour(start_time)) AS t, sum(cost) AS spend, quantile(0.95)(duration_ms) AS latency,
            countIf(status_code = 'ERROR') AS errors, count() AS requests
     FROM ${SPANS}
     WHERE project_id = {pid:String} AND ${LLM} ${env ? "AND environment = {env:String}" : ""}
       AND start_time >= fromUnixTimestamp64Milli({from:Int64}) AND start_time < fromUnixTimestamp64Milli({to:Int64})
     GROUP BY t ORDER BY t`,
    params,
  );
  const byT = new Map(rows.map((r) => [Number(r.t) * 1000, r]));
  const points: HourPoint[] = [];
  for (let t = start; t < end; t += HOUR) {
    const r = byT.get(t);
    const requests = Number(r?.requests) || 0;
    points.push({
      t, requests, cost: Number(r?.spend) || 0, latency: Number(r?.latency) || 0,
      errors: requests ? (Number(r?.errors) || 0) / requests : 0, flags: [],
    });
  }
  return points;
}

async function contributor(projectId: string, metric: Metric, start: number, end: number, env?: string) {
  const params: Params = { pid: projectId, from: start, to: end, bfrom: start - BASELINE_HOURS * HOUR };
  if (env) params.env = env;
  const hours = (end - start) / HOUR;
  const during = "start_time >= fromUnixTimestamp64Milli({from:Int64})";
  const before = "start_time < fromUnixTimestamp64Milli({from:Int64})";
  const measure = (cond: string) =>
    metric === "cost" ? `sumIf(cost, ${cond})` : metric === "errors" ? `countIf(status_code = 'ERROR' AND ${cond})` : `sumIf(duration_ms, ${cond})`;

  const candidates = await Promise.all(
    (["model", "service_name", "user_id"] as const).map(async (dim) => {
      const data = await query<Record<string, unknown>>(
        `SELECT ${dim} AS v, ${measure(during)} AS during, ${measure(before)} / ${BASELINE_HOURS} * ${hours} AS expected
         FROM ${SPANS}
         WHERE project_id = {pid:String} AND ${LLM} ${env ? "AND environment = {env:String}" : ""} AND ${dim} != ''
           AND start_time >= fromUnixTimestamp64Milli({bfrom:Int64}) AND start_time < fromUnixTimestamp64Milli({to:Int64})
         GROUP BY v`,
        params,
      );
      // Excess over each value's own typical level, so a steady heavy hitter is not blamed.
      const excess = data.map((r) => ({ value: String(r.v), excess: Math.max(0, (Number(r.during) || 0) - (Number(r.expected) || 0)) }));
      const total = excess.reduce((s, e) => s + e.excess, 0);
      const top = excess.sort((x, y) => y.excess - x.excess)[0];
      return top && total > 0 ? { dimension: dim as string, value: top.value, share: top.excess / total } : null;
    }),
  );
  // Report a contributor only when one value clearly dominates; prefer the most concentrated dimension.
  return candidates.filter((c): c is NonNullable<typeof c> => !!c && c.share >= 0.5).sort((x, y) => y.share - x.share)[0];
}

const LABEL: Record<string, string> = { model: "model", service_name: "service", user_id: "user" };

function describe(i: Omit<Incident, "title" | "summary">): { title: string; summary: string } {
  const hours = Math.round((i.end - i.start) / HOUR);
  const span = hours === 1 ? "1 hour" : `${hours} hours`;
  const who = i.contributor
    ? ` ${pct(i.contributor.share, 0)} of the increase came from ${LABEL[i.contributor.dimension]} ${i.contributor.value}.`
    : " No single model, service, or user explains most of it.";
  const times = i.baseline > 0 ? `${i.ratio >= 10 ? Math.round(i.ratio) : i.ratio.toFixed(1)}× the usual level` : "well above the usual level";
  if (i.metric === "cost") {
    return {
      title: `Spend at ${times}`,
      summary: `Spend peaked at ${usd(i.peak)} per hour against a typical ${usd(i.baseline)}, for ${span}.${who}`,
    };
  }
  if (i.metric === "latency") {
    return {
      title: `Slow responses: p95 at ${times}`,
      summary: `p95 latency peaked at ${duration(i.peak)} against a typical ${duration(i.baseline)}, for ${span}.${who}`,
    };
  }
  return {
    title: `Error rate up to ${pct(i.peak, 0)}`,
    summary: `${pct(i.peak, 0)} of calls failed at the peak against a typical ${pct(i.baseline, 1)}, for ${span}.${who}`,
  };
}

export async function findAnomalies(projectId: string, from: number, to: number, env?: string): Promise<{ incidents: Incident[]; points: HourPoint[] }> {
  const all = await hourly(projectId, from, to, env);
  const firstVisible = Math.floor(from / HOUR) * HOUR;
  const lastHour = all.length ? all[all.length - 1].t : 0;
  const drafts: Omit<Incident, "title" | "summary">[] = [];

  for (const metric of ["cost", "latency", "errors"] as Metric[]) {
    // Latency and error rate need enough calls in the hour to mean anything.
    const valid = all.map((p) => (metric === "cost" ? true : p.requests >= 10));
    const result = detect(all.map((p) => p[metric]), metric, valid);
    let open: Omit<Incident, "title" | "summary"> | null = null;
    result.forEach((r, idx) => {
      const p = all[idx];
      if (r.flagged && p.t >= firstVisible) {
        p.flags.push(metric);
        if (open && open.end === p.t) {
          open.end = p.t + HOUR;
          if (p[metric] > open.peak) open.peak = p[metric];
        } else {
          open = { id: `${metric}-${p.t}`, metric, severity: "warning", start: p.t, end: p.t + HOUR, peak: p[metric], baseline: r.baseline, ratio: 0, ongoing: false };
          drafts.push(open);
        }
      } else {
        open = null;
      }
    });
  }

  const incidents = await Promise.all(
    drafts.slice(-20).map(async (d) => {
      d.ratio = d.baseline > 0 ? d.peak / d.baseline : 0;
      d.ongoing = d.end > lastHour;
      d.severity = (d.metric === "errors" ? d.peak >= 0.25 : d.ratio >= 4) ? "critical" : "warning";
      d.contributor = await contributor(projectId, d.metric, d.start, d.end, env).catch(() => undefined);
      return { ...d, ...describe(d) } as Incident;
    }),
  );
  incidents.sort((a, b) => b.start - a.start);
  return { incidents, points: all.filter((p) => p.t >= firstVisible) };
}
