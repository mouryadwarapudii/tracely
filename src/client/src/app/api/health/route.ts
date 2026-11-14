import { ping } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

export async function GET() {
  const clickhouse = await ping();
  return Response.json({ status: clickhouse ? "ok" : "degraded", clickhouse }, { status: clickhouse ? 200 : 503 });
}
