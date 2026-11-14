import { query, SPANS, type Params } from "./clickhouse";
import type { Scope } from "./time";

/** Shared WHERE clause. Every value travels as a bound parameter. */
export function where(scope: Pick<Scope, "projectId" | "from" | "to" | "env">, extra: string[] = []): { sql: string; params: Params } {
  const parts = [
    "project_id = {pid:String}",
    "start_time >= fromUnixTimestamp64Milli({from:Int64})",
    "start_time < fromUnixTimestamp64Milli({to:Int64})",
  ];
  const params: Params = { pid: scope.projectId, from: scope.from, to: scope.to };
  if (scope.env) {
    parts.push("environment = {env:String}");
    params.env = scope.env;
  }
  return { sql: [...parts, ...extra].join(" AND "), params };
}

const LLM = "span_type IN ('llm', 'embedding')";
const n = (v: unknown) => Number(v) || 0;

/* ---------- overview ---------- */

export type Totals = { requests: number; cost: number; tokens: number; input_tokens: number; output_tokens: number; avg_ms: number; p95_ms: number; errors: number; traces: number };

export async function totals(scope: Scope): Promise<Totals> {
  const w = where(scope, [LLM]);
  const [r] = await query<Record<string, unknown>>(
    `SELECT count() AS requests, sum(cost) AS spend, sum(total_tokens) AS tokens,
            sum(input_tokens) AS in_tok, sum(output_tokens) AS out_tok,
            avg(duration_ms) AS avg_ms, quantile(0.95)(duration_ms) AS p95_ms,
            countIf(status_code = 'ERROR') AS errors, uniqExact(trace_id) AS traces
     FROM ${SPANS} WHERE ${w.sql}`,
    w.params,
  );
  return {
    requests: n(r?.requests), cost: n(r?.spend), tokens: n(r?.tokens), input_tokens: n(r?.in_tok), output_tokens: n(r?.out_tok),
    avg_ms: n(r?.avg_ms), p95_ms: n(r?.p95_ms), errors: n(r?.errors), traces: n(r?.traces),
  };
}

export type Point = { t: number; requests: number; cost: number; tokens: number; p95_ms: number; errors: number };

export async function series(scope: Scope): Promise<Point[]> {
  const w = where(scope, [LLM]);
  const rows = await query<Record<string, unknown>>(
    `SELECT toUnixTimestamp(toStartOfInterval(start_time, toIntervalSecond({b:UInt32}))) AS t,
            count() AS requests, sum(cost) AS spend, sum(total_tokens) AS tokens,
            quantile(0.95)(duration_ms) AS p95_ms, countIf(status_code = 'ERROR') AS errors
     FROM ${SPANS} WHERE ${w.sql} GROUP BY t ORDER BY t`,
    { ...w.params, b: scope.bucket },
  );
  const byT = new Map(rows.map((r) => [n(r.t) * 1000, r]));
  const out: Point[] = [];
  for (let t = scope.from; t < scope.to; t += scope.bucket * 1000) {
    const r = byT.get(t);
    out.push({ t, requests: n(r?.requests), cost: n(r?.spend), tokens: n(r?.tokens), p95_ms: n(r?.p95_ms), errors: n(r?.errors) });
  }
  return out;
}

export type Breakdown = { key: string; requests: number; cost: number; tokens: number; input_tokens: number; output_tokens: number; avg_ms: number; p95_ms: number; errors: number };
export type Dimension = "model" | "provider" | "service_name" | "user_id" | "environment";
const DIMENSIONS: Dimension[] = ["model", "provider", "service_name", "user_id", "environment"];

export async function breakdown(scope: Scope, dimension: Dimension, limit = 8): Promise<Breakdown[]> {
  if (!DIMENSIONS.includes(dimension)) throw new Error("unknown dimension");
  const w = where(scope, [LLM, `${dimension} != ''`]);
  const rows = await query<Record<string, unknown>>(
    `SELECT ${dimension} AS key, count() AS requests, sum(cost) AS spend, sum(total_tokens) AS tokens,
            sum(input_tokens) AS in_tok, sum(output_tokens) AS out_tok,
            avg(duration_ms) AS avg_ms, quantile(0.95)(duration_ms) AS p95_ms, countIf(status_code = 'ERROR') AS errors
     FROM ${SPANS} WHERE ${w.sql} GROUP BY key ORDER BY spend DESC, requests DESC LIMIT {limit:UInt32}`,
    { ...w.params, limit },
  );
  return rows.map((r) => ({
    key: String(r.key), requests: n(r.requests), cost: n(r.spend), tokens: n(r.tokens), input_tokens: n(r.in_tok),
    output_tokens: n(r.out_tok), avg_ms: n(r.avg_ms), p95_ms: n(r.p95_ms), errors: n(r.errors),
  }));
}

/** Cost per bucket for the top models; everything else folds into "Other". */
export async function costByModelSeries(scope: Scope, top = 4): Promise<{ models: string[]; points: Record<string, number>[] }> {
  const leaders = (await breakdown(scope, "model", top)).map((m) => m.key);
  const w = where(scope, [LLM]);
  const rows = await query<Record<string, unknown>>(
    `SELECT toUnixTimestamp(toStartOfInterval(start_time, toIntervalSecond({b:UInt32}))) AS t,
            if(has({leaders:Array(String)}, model), model, 'Other') AS m, sum(cost) AS spend
     FROM ${SPANS} WHERE ${w.sql} GROUP BY t, m ORDER BY t`,
    { ...w.params, b: scope.bucket, leaders },
  );
  const hasOther = rows.some((r) => r.m === "Other" && n(r.spend) > 0);
  const models = hasOther ? [...leaders, "Other"] : leaders;
  const byT = new Map<number, Record<string, number>>();
  for (let t = scope.from; t < scope.to; t += scope.bucket * 1000) byT.set(t, { t, ...Object.fromEntries(models.map((m) => [m, 0])) });
  for (const r of rows) {
    const p = byT.get(n(r.t) * 1000);
    if (p && String(r.m) in p) p[String(r.m)] = n(r.spend);
  }
  return { models, points: [...byT.values()] };
}

export async function environments(projectId: string): Promise<string[]> {
  const rows = await query<{ environment: string }>(
    `SELECT DISTINCT environment FROM ${SPANS} WHERE project_id = {pid:String} AND start_time > now() - INTERVAL 30 DAY ORDER BY environment`,
    { pid: projectId },
  );
  return rows.map((r) => r.environment).filter(Boolean);
}

export async function hasAnyData(projectId: string): Promise<boolean> {
  const rows = await query(`SELECT 1 FROM ${SPANS} WHERE project_id = {pid:String} LIMIT 1`, { pid: projectId });
  return rows.length > 0;
}

/* ---------- traces ---------- */

export type TraceRow = {
  trace_id: string; started: number; duration_ms: number; spans: number; llm_calls: number; cost: number; tokens: number;
  errors: number; name: string; models: string[]; service: string; session_id: string; user_id: string;
};

export type TraceFilter = { status?: string; model?: string; service?: string; q?: string; session?: string; user?: string };

export async function traces(scope: Scope, filter: TraceFilter, page: number, pageSize = 50): Promise<{ rows: TraceRow[]; more: boolean }> {
  const w = where(scope);
  const having: string[] = [];
  const params: Params = { ...w.params, limit: pageSize + 1, offset: page * pageSize };
  if (filter.status === "error") having.push("errors > 0");
  if (filter.status === "ok") having.push("errors = 0");
  if (filter.model) { having.push("has(models, {model:String})"); params.model = filter.model; }
  if (filter.service) { having.push("service = {service:String}"); params.service = filter.service; }
  if (filter.session) { having.push("sess = {session:String}"); params.session = filter.session; }
  if (filter.user) { having.push("usr = {user:String}"); params.user = filter.user; }
  if (filter.q) {
    having.push("(positionCaseInsensitive(root_name, {q:String}) > 0 OR trace_id = {q:String} OR matched > 0)");
    params.q = filter.q;
  }
  const matched = filter.q ? "countIf(positionCaseInsensitive(input, {q:String}) > 0 OR positionCaseInsensitive(output, {q:String}) > 0)" : "0";
  const rows = await query<Record<string, unknown>>(
    `SELECT trace_id,
            toUnixTimestamp64Milli(min(start_time)) AS started,
            max(toUnixTimestamp64Milli(start_time) + duration_ms) - toUnixTimestamp64Milli(min(start_time)) AS total_ms,
            count() AS spans, countIf(${LLM}) AS llm_calls, sum(cost) AS spend, sum(total_tokens) AS tokens,
            countIf(status_code = 'ERROR') AS errors,
            argMin(name, (parent_span_id != '', start_time)) AS root_name,
            groupUniqArrayIf(model, model != '') AS models,
            any(service_name) AS service, max(session_id) AS sess, max(user_id) AS usr,
            ${matched} AS matched
     FROM ${SPANS} WHERE ${w.sql}
     GROUP BY trace_id ${having.length ? "HAVING " + having.join(" AND ") : ""}
     ORDER BY started DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
    params,
  );
  const mapped = rows.map((r) => ({
    trace_id: String(r.trace_id), started: n(r.started), duration_ms: n(r.total_ms), spans: n(r.spans), llm_calls: n(r.llm_calls),
    cost: n(r.spend), tokens: n(r.tokens), errors: n(r.errors), name: String(r.root_name), models: (r.models as string[]) || [],
    service: String(r.service), session_id: String(r.sess), user_id: String(r.usr),
  }));
  return { rows: mapped.slice(0, pageSize), more: mapped.length > pageSize };
}

export type Span = {
  trace_id: string; span_id: string; parent_span_id: string; name: string; kind: string; service_name: string; environment: string;
  start: number; duration_ms: number; status_code: string; status_message: string; span_type: string; provider: string; model: string;
  operation: string; tool_name: string; input_tokens: number; output_tokens: number; total_tokens: number; cost: number;
  session_id: string; user_id: string; input: string; output: string; attributes: Record<string, string>; events: string;
};

const SPAN_COLUMNS = `trace_id, span_id, parent_span_id, name, kind, service_name, environment,
  toUnixTimestamp64Micro(start_time) / 1000 AS start, duration_ms, status_code, status_message, span_type, provider, model,
  operation, tool_name, input_tokens, output_tokens, total_tokens, cost, session_id, user_id, input, output, attributes, events`;

function toSpan(r: Record<string, unknown>): Span {
  return {
    ...(r as unknown as Span),
    start: n(r.start), duration_ms: n(r.duration_ms), input_tokens: n(r.input_tokens), output_tokens: n(r.output_tokens),
    total_tokens: n(r.total_tokens), cost: n(r.cost),
  };
}

export async function traceSpans(projectId: string, traceId: string): Promise<Span[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${SPAN_COLUMNS} FROM ${SPANS} WHERE project_id = {pid:String} AND trace_id = {tid:String} ORDER BY start_time LIMIT 2000`,
    { pid: projectId, tid: traceId },
  );
  return rows.map(toSpan);
}

export async function filterOptions(scope: Scope): Promise<{ models: string[]; services: string[] }> {
  const w = where(scope);
  const [r] = await query<{ models: string[]; services: string[] }>(
    `SELECT arraySort(groupUniqArrayIf(model, model != '')) AS models, arraySort(groupUniqArray(service_name)) AS services FROM ${SPANS} WHERE ${w.sql}`,
    w.params,
  );
  return { models: r?.models || [], services: r?.services || [] };
}

/* ---------- sessions ---------- */

export type SessionRow = {
  session_id: string; started: number; last: number; traces: number; llm_calls: number; tool_calls: number; cost: number; tokens: number;
  errors: number; user_id: string; service: string;
};

export async function sessions(scope: Scope, page: number, pageSize = 50): Promise<{ rows: SessionRow[]; more: boolean }> {
  const w = where(scope, ["session_id != ''"]);
  const rows = await query<Record<string, unknown>>(
    `SELECT session_id, toUnixTimestamp64Milli(min(start_time)) AS started,
            max(toUnixTimestamp64Milli(start_time) + duration_ms) AS last,
            uniqExact(trace_id) AS traces, countIf(${LLM}) AS llm_calls, countIf(span_type = 'tool') AS tool_calls,
            sum(cost) AS spend, sum(total_tokens) AS tokens, countIf(status_code = 'ERROR') AS errors,
            max(user_id) AS usr, any(service_name) AS service
     FROM ${SPANS} WHERE ${w.sql} GROUP BY session_id ORDER BY last DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
    { ...w.params, limit: pageSize + 1, offset: page * pageSize },
  );
  const mapped = rows.map((r) => ({
    session_id: String(r.session_id), started: n(r.started), last: n(r.last), traces: n(r.traces), llm_calls: n(r.llm_calls),
    tool_calls: n(r.tool_calls), cost: n(r.spend), tokens: n(r.tokens), errors: n(r.errors), user_id: String(r.usr), service: String(r.service),
  }));
  return { rows: mapped.slice(0, pageSize), more: mapped.length > pageSize };
}

export async function sessionSpans(projectId: string, sessionId: string): Promise<Span[]> {
  // Spans without the session attribute still belong if their trace does, so select by trace membership.
  const rows = await query<Record<string, unknown>>(
    `SELECT ${SPAN_COLUMNS} FROM ${SPANS}
     WHERE project_id = {pid:String} AND trace_id IN (
       SELECT DISTINCT trace_id FROM ${SPANS} WHERE project_id = {pid:String} AND session_id = {sid:String}
     ) ORDER BY start_time LIMIT 3000`,
    { pid: projectId, sid: sessionId },
  );
  return rows.map(toSpan);
}
