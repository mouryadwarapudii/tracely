import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { DATABASE, MIGRATIONS } from "@/clickhouse/schema";

type Globals = { __tracelyCh?: ClickHouseClient; __tracelyChReady?: Promise<void> };
const g = globalThis as unknown as Globals;

function client(): ClickHouseClient {
  if (!g.__tracelyCh) {
    g.__tracelyCh = createClient({
      url: process.env.TRACELY_CLICKHOUSE_URL || "http://127.0.0.1:8123",
      username: process.env.TRACELY_CLICKHOUSE_USER || "default",
      password: process.env.TRACELY_CLICKHOUSE_PASSWORD || "",
      request_timeout: 30_000,
    });
  }
  return g.__tracelyCh;
}

async function migrate() {
  for (const statement of MIGRATIONS) {
    await client().command({ query: statement });
  }
}

function ready(): Promise<void> {
  if (!g.__tracelyChReady) {
    g.__tracelyChReady = migrate().catch((err) => {
      g.__tracelyChReady = undefined; // retry on the next request
      throw err;
    });
  }
  return g.__tracelyChReady;
}

export type Params = Record<string, string | number | string[]>;

/** Run a read query. Always pass user input through `params`, never string-concatenate it. */
export async function query<T>(sql: string, params: Params = {}): Promise<T[]> {
  await ready();
  const rs = await client().query({ query: sql, query_params: params, format: "JSONEachRow" });
  return (await rs.json()) as T[];
}

export async function insertSpans(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  await ready();
  await client().insert({ table: `${DATABASE}.spans`, values: rows, format: "JSONEachRow" });
}

export async function ping(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export const SPANS = `${DATABASE}.spans`;
