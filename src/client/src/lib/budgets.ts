import { query, SPANS, type Params } from "./clickhouse";
import { listBudgets, type Budget } from "./db";

export type BudgetStatus = Budget & {
  spent: number;
  forecast: number;
  periodStart: number;
  periodEnd: number;
  state: "ok" | "warning" | "forecast" | "exceeded";
};

export function periodBounds(period: Budget["period"], nowMs = Date.now()): { start: number; end: number } {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (period === "daily") return { start: Date.UTC(y, m, day), end: Date.UTC(y, m, day + 1) };
  if (period === "weekly") {
    const monday = day - ((d.getUTCDay() + 6) % 7);
    return { start: Date.UTC(y, m, monday), end: Date.UTC(y, m, monday + 7) };
  }
  return { start: Date.UTC(y, m, 1), end: Date.UTC(y, m + 1, 1) };
}

const SCOPE_COLUMN: Record<Budget["scope_type"], string | null> = {
  all: null, model: "model", service: "service_name", user: "user_id", environment: "environment",
};

export function evaluate(b: Budget, spent: number, nowMs = Date.now()): BudgetStatus {
  const { start, end } = periodBounds(b.period, nowMs);
  const elapsed = Math.max(nowMs - start, 1);
  // Forecasting from the first sliver of a period is noise; wait for 10% of it.
  const forecast = elapsed / (end - start) >= 0.1 ? (spent / elapsed) * (end - start) : spent;
  const state: BudgetStatus["state"] =
    spent >= b.amount ? "exceeded" : spent >= (b.amount * b.threshold_pct) / 100 ? "warning" : forecast > b.amount ? "forecast" : "ok";
  return { ...b, spent, forecast, periodStart: start, periodEnd: end, state };
}

export async function budgetStatuses(projectId: string, nowMs = Date.now()): Promise<BudgetStatus[]> {
  return Promise.all(
    listBudgets(projectId).map(async (b) => {
      const { start, end } = periodBounds(b.period, nowMs);
      const column = SCOPE_COLUMN[b.scope_type];
      const params: Params = { pid: projectId, from: start, to: end };
      if (column) params.value = b.scope_value;
      const [row] = await query<{ spend: number }>(
        `SELECT sum(cost) AS spend FROM ${SPANS}
         WHERE project_id = {pid:String} AND start_time >= fromUnixTimestamp64Milli({from:Int64}) AND start_time < fromUnixTimestamp64Milli({to:Int64})
         ${column ? `AND ${column} = {value:String}` : ""}`,
        params,
      );
      return evaluate(b, Number(row?.spend) || 0, nowMs);
    }),
  );
}
