import { gunzipSync } from "node:zlib";
import { insertSpans } from "@/lib/clickhouse";
import { decodeProtobuf, normalize } from "@/lib/otlp";
import { projectFromRequest } from "@/lib/apikey";

export const runtime = "nodejs";
const MAX_BYTES = 16 * 1024 * 1024;

/** OTLP/HTTP trace receiver. Accepts JSON and protobuf, optionally gzip-compressed. */
export async function POST(request: Request) {
  const projectId = projectFromRequest(request);
  if (!projectId) return Response.json({ error: "Missing or invalid API key. Send it as 'Authorization: Bearer <key>'." }, { status: 401 });

  let body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX_BYTES) return Response.json({ error: "Payload larger than 16 MB." }, { status: 413 });
  const type = request.headers.get("content-type") || "";

  let payload: unknown;
  try {
    if (request.headers.get("content-encoding") === "gzip") body = gunzipSync(body, { maxOutputLength: MAX_BYTES * 4 });
    payload = type.includes("json") ? JSON.parse(body.toString("utf8")) : decodeProtobuf(body);
  } catch {
    return Response.json({ error: "Body is not a valid OTLP ExportTraceServiceRequest." }, { status: 400 });
  }

  const rows = normalize(payload, projectId);
  try {
    await insertSpans(rows);
  } catch (err) {
    console.error("[tracely] span insert failed:", (err as Error).message);
    return Response.json({ error: "Storage is unavailable. Retry later." }, { status: 503, headers: { "retry-after": "5" } });
  }

  // An empty ExportTraceServiceResponse, in the encoding the client used.
  if (type.includes("json")) return Response.json({});
  return new Response(new Uint8Array(0), { status: 200, headers: { "content-type": "application/x-protobuf" } });
}
