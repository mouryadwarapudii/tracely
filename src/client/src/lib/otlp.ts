import protobuf from "protobufjs";
import { computeCost } from "./pricing.ts";

/**
 * OTLP/HTTP trace decoding and normalisation.
 *
 * Accepts both encodings of ExportTraceServiceRequest (JSON and protobuf) and
 * flattens each span into one row for the `spans` table, lifting the
 * OpenTelemetry GenAI semantic-convention attributes into typed columns.
 */

const PROTO = `
syntax = "proto3";
package otlp;
message ExportTraceServiceRequest { repeated ResourceSpans resource_spans = 1; }
message ResourceSpans { Resource resource = 1; repeated ScopeSpans scope_spans = 2; string schema_url = 3; }
message Resource { repeated KeyValue attributes = 1; uint32 dropped_attributes_count = 2; }
message ScopeSpans { InstrumentationScope scope = 1; repeated Span spans = 2; string schema_url = 3; }
message InstrumentationScope { string name = 1; string version = 2; repeated KeyValue attributes = 3; uint32 dropped_attributes_count = 4; }
message Span {
  bytes trace_id = 1; bytes span_id = 2; string trace_state = 3; bytes parent_span_id = 4;
  string name = 5; int32 kind = 6; fixed64 start_time_unix_nano = 7; fixed64 end_time_unix_nano = 8;
  repeated KeyValue attributes = 9; uint32 dropped_attributes_count = 10;
  repeated Event events = 11; uint32 dropped_events_count = 12;
  repeated Link links = 13; uint32 dropped_links_count = 14; Status status = 15; fixed32 flags = 16;
}
message Event { fixed64 time_unix_nano = 1; string name = 2; repeated KeyValue attributes = 3; uint32 dropped_attributes_count = 4; }
message Link { bytes trace_id = 1; bytes span_id = 2; string trace_state = 3; repeated KeyValue attributes = 4; uint32 dropped_attributes_count = 5; fixed32 flags = 6; }
message Status { string message = 2; int32 code = 3; }
message KeyValue { string key = 1; AnyValue value = 2; }
message AnyValue {
  oneof value {
    string string_value = 1; bool bool_value = 2; int64 int_value = 3; double double_value = 4;
    ArrayValue array_value = 5; KeyValueList kvlist_value = 6; bytes bytes_value = 7;
  }
}
message ArrayValue { repeated AnyValue values = 1; }
message KeyValueList { repeated KeyValue values = 1; }
`;

let requestType: protobuf.Type | undefined;

export function decodeProtobuf(body: Uint8Array): unknown {
  requestType ??= protobuf.parse(PROTO).root.lookupType("otlp.ExportTraceServiceRequest");
  const message = requestType.decode(body);
  return requestType.toObject(message, { longs: String, bytes: Array, defaults: false });
}

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MAX_TEXT = 64_000;
const MAX_ATTR = 4_000;
const KINDS = ["UNSPECIFIED", "INTERNAL", "SERVER", "CLIENT", "PRODUCER", "CONSUMER"];
const STATUS = ["UNSET", "OK", "ERROR"];

function hex(id: unknown): string {
  if (!id) return "";
  if (typeof id === "string") {
    // JSON encoding is hex; tolerate base64 from non-conforming senders.
    return /^[0-9a-fA-F]+$/.test(id) ? id.toLowerCase() : Buffer.from(id, "base64").toString("hex");
  }
  if (Array.isArray(id) || id instanceof Uint8Array) return Buffer.from(id as number[]).toString("hex");
  return "";
}

function anyValue(v: Any | undefined): unknown {
  if (!v) return "";
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(anyValue);
  if (v.kvlistValue) return Object.fromEntries((v.kvlistValue.values || []).map((kv: Any) => [kv.key, anyValue(kv.value)]));
  if (v.bytesValue !== undefined) return "[bytes]";
  return "";
}

function attrs(list: Any[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kv of list || []) if (kv?.key) out[kv.key] = anyValue(kv.value);
  return out;
}

function text(v: unknown, max = MAX_TEXT): string {
  if (v === undefined || v === null || v === "") return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…[truncated]" : s;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function first(a: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (a[k] !== undefined && a[k] !== "") return a[k];
  return undefined;
}

function spanType(a: Record<string, unknown>, operation: string): string {
  switch (operation) {
    case "chat":
    case "text_completion":
    case "generate_content":
    case "completion":
      return "llm";
    case "embeddings":
    case "embedding":
      return "embedding";
    case "execute_tool":
    case "tool":
      return "tool";
    case "invoke_agent":
    case "create_agent":
    case "agent":
      return "agent";
    case "retrieval":
    case "vectordb":
      return "retrieval";
  }
  if (a["gen_ai.tool.name"]) return "tool";
  if (a["db.system"] || a["db.system.name"]) return "retrieval";
  if (a["gen_ai.request.model"] || a["gen_ai.response.model"]) return "llm";
  return "span";
}

export type SpanRow = {
  project_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  name: string;
  kind: string;
  service_name: string;
  environment: string;
  start_time: number;
  duration_ms: number;
  status_code: string;
  status_message: string;
  span_type: string;
  provider: string;
  model: string;
  operation: string;
  tool_name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  session_id: string;
  user_id: string;
  input: string;
  output: string;
  attributes: Record<string, string>;
  resource_attributes: Record<string, string>;
  events: string;
};

function stringMap(a: Record<string, unknown>, skip: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) if (!skip.has(k)) out[k] = text(v, MAX_ATTR);
  return out;
}

const CONTENT_KEYS = new Set([
  "gen_ai.input.messages",
  "gen_ai.output.messages",
  "gen_ai.prompt",
  "gen_ai.completion",
  "gen_ai.tool.call.arguments",
  "gen_ai.tool.call.result",
  "tracely.input",
  "tracely.output",
]);

export function normalize(payload: unknown, projectId: string): SpanRow[] {
  const rows: SpanRow[] = [];
  const req = (payload || {}) as Any;
  for (const rs of req.resourceSpans || []) {
    const res = attrs(rs.resource?.attributes);
    const service = text(first(res, "service.name") ?? "unknown", 200);
    const environment = text(first(res, "deployment.environment.name", "deployment.environment") ?? "default", 100);
    const resourceMap = stringMap(res, new Set());

    for (const ss of rs.scopeSpans || []) {
      for (const span of ss.spans || []) {
        const a = attrs(span.attributes);
        const events = (span.events || []).map((e: Any) => ({
          name: e.name || "",
          time: String(e.timeUnixNano || "0"),
          attributes: attrs(e.attributes),
        }));

        const start = BigInt(span.startTimeUnixNano || 0);
        const end = BigInt(span.endTimeUnixNano || 0);
        const operation = text(first(a, "gen_ai.operation.name") ?? "", 60);
        const type = spanType(a, operation);
        const model = text(first(a, "gen_ai.response.model", "gen_ai.request.model") ?? "", 200);
        const inputTokens = num(first(a, "gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens"));
        const outputTokens = num(first(a, "gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens"));
        const reportedCost = first(a, "gen_ai.usage.cost", "tracely.cost");

        // Content may arrive as attributes (current conventions) or as span events (older SDKs).
        let input = first(a, "tracely.input", "gen_ai.input.messages", "gen_ai.prompt", "gen_ai.tool.call.arguments");
        let output = first(a, "tracely.output", "gen_ai.output.messages", "gen_ai.completion", "gen_ai.tool.call.result");
        for (const e of events) {
          if (input === undefined && e.name === "gen_ai.content.prompt") input = e.attributes["gen_ai.prompt"];
          if (output === undefined && e.name === "gen_ai.content.completion") output = e.attributes["gen_ai.completion"];
        }

        const statusCode = STATUS[Number(span.status?.code) || 0] || "UNSET";
        const exception = events.find((e: Any) => e.name === "exception");

        rows.push({
          project_id: projectId,
          trace_id: hex(span.traceId),
          span_id: hex(span.spanId),
          parent_span_id: hex(span.parentSpanId),
          name: text(span.name, 300),
          kind: typeof span.kind === "string" ? span.kind.replace("SPAN_KIND_", "") : KINDS[Number(span.kind) || 0] || "UNSPECIFIED",
          service_name: service,
          environment,
          start_time: Number(start / 1000n) / 1e6,
          duration_ms: end > start ? Number(end - start) / 1e6 : 0,
          status_code: statusCode,
          status_message: text(span.status?.message || exception?.attributes["exception.message"] || "", 2000),
          span_type: type,
          provider: text(first(a, "gen_ai.provider.name", "gen_ai.system") ?? "", 60),
          model,
          operation,
          tool_name: text(first(a, "gen_ai.tool.name") ?? "", 200),
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          cost: reportedCost !== undefined ? num(reportedCost) : computeCost(model, inputTokens, outputTokens),
          session_id: text(first(a, "session.id", "gen_ai.conversation.id") ?? "", 200),
          user_id: text(first(a, "user.id", "enduser.id") ?? "", 200),
          input: text(input),
          output: text(output),
          attributes: stringMap(a, CONTENT_KEYS),
          resource_attributes: resourceMap,
          events: events.length ? text(events, 16_000) : "",
        });
      }
    }
  }
  return rows.filter((r) => r.trace_id && r.span_id);
}
