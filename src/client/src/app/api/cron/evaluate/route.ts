import { timingSafeEqual } from "node:crypto";
import { evaluateAlerts } from "@/lib/alerts";

/** Evaluate budgets and anomalies now. Protected by TRACELY_CRON_SECRET; disabled when it is unset. */
export async function POST(request: Request) {
  const expected = process.env.TRACELY_CRON_SECRET || "";
  const given = (request.headers.get("authorization") || "").replace(/^Bearer /i, "");
  const ok = expected.length > 0 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await evaluateAlerts());
}
