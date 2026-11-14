import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../lib/otlp.ts";
import { computeCost, findPrice } from "../lib/pricing.ts";

const kv = (o: Record<string, string | number>) =>
  Object.entries(o).map(([key, v]) => ({ key, value: typeof v === "number" ? { intValue: String(v) } : { stringValue: v } }));

test("prices match by longest prefix", () => {
  assert.equal(findPrice("gpt-4o-mini-2024-07-18")?.key, "gpt-4o-mini");
  assert.equal(findPrice("gpt-4o-2024-08-06")?.key, "gpt-4o");
  assert.equal(findPrice("some-unknown-model"), null);
  assert.equal(computeCost("gpt-4o-mini", 1_000_000, 1_000_000), 0.75);
  assert.equal(computeCost("some-unknown-model", 1000, 1000), 0);
});

test("normalize lifts GenAI attributes into columns and computes cost", () => {
  const [row] = normalize(
    {
      resourceSpans: [{
        resource: { attributes: kv({ "service.name": "api", "deployment.environment.name": "production" }) },
        scopeSpans: [{
          spans: [{
            traceId: "0AF7651916CD43DD8448EB211C80319C", spanId: "b7ad6b7169203331", name: "chat gpt-4o", kind: 3,
            startTimeUnixNano: "1700000000000000000", endTimeUnixNano: "1700000001500000000",
            attributes: kv({
              "gen_ai.operation.name": "chat", "gen_ai.provider.name": "openai", "gen_ai.request.model": "gpt-4o",
              "gen_ai.usage.input_tokens": 1000, "gen_ai.usage.output_tokens": 500, "session.id": "s1", "user.id": "u1",
              "gen_ai.input.messages": '[{"role":"user","parts":[{"type":"text","content":"hi"}]}]',
            }),
            status: { code: 2, message: "boom" },
          }],
        }],
      }],
    },
    "p1",
  );
  assert.equal(row.trace_id, "0af7651916cd43dd8448eb211c80319c");
  assert.equal(row.span_type, "llm");
  assert.equal(row.service_name, "api");
  assert.equal(row.environment, "production");
  assert.equal(row.duration_ms, 1500);
  assert.equal(row.start_time, 1700000000);
  assert.equal(row.total_tokens, 1500);
  assert.equal(row.cost, (1000 * 2.5 + 500 * 10) / 1e6);
  assert.equal(row.status_code, "ERROR");
  assert.equal(row.session_id, "s1");
  assert.ok(row.input.includes('"hi"'));
  assert.equal(row.attributes["gen_ai.input.messages"], undefined, "content is stored once, in the input column");
});

test("normalize honours reported cost, older attribute names, and drops spans without ids", () => {
  const rows = normalize(
    {
      resourceSpans: [{
        scopeSpans: [{
          spans: [
            { traceId: "aa", spanId: "bb", name: "x", attributes: kv({ "gen_ai.system": "anthropic", "gen_ai.request.model": "claude-sonnet-4", "gen_ai.usage.prompt_tokens": 10, "gen_ai.usage.completion_tokens": 5 }).concat([{ key: "gen_ai.usage.cost", value: { doubleValue: 0.42 } } as never]) },
            { name: "no ids" },
            { traceId: "aa", spanId: "cc", name: "execute_tool search", attributes: kv({ "gen_ai.tool.name": "search" }) },
          ],
        }],
      }],
    },
    "p1",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].provider, "anthropic");
  assert.equal(rows[0].input_tokens, 10);
  assert.equal(rows[0].cost, 0.42);
  assert.equal(rows[0].service_name, "unknown");
  assert.equal(rows[1].span_type, "tool");
});
