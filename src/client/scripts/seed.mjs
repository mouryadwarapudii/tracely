#!/usr/bin/env node
/**
 * Demo data generator. Sends ~14 days of realistic LLM traffic to a running
 * Tracely instance over OTLP/HTTP JSON, including a spend spike, a latency
 * spike, and an error burst so every page has something to show.
 *
 *   TRACELY_API_KEY=tr_... node scripts/seed.mjs [--url http://localhost:3000] [--days 14]
 */
import { randomBytes } from "node:crypto";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const URL_BASE = arg("url", process.env.TRACELY_URL || "http://localhost:3000");
const KEY = arg("key", process.env.TRACELY_API_KEY);
const DAYS = Number(arg("days", 14));
if (!KEY) {
  console.error("Set TRACELY_API_KEY (create one under Settings → API keys).");
  process.exit(1);
}

// Deterministic randomness so repeated runs produce comparable data.
let seed = 20261113;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rnd() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const chance = (p) => rnd() < p;
const hexId = (bytes) => randomBytes(bytes).toString("hex");

const HOUR = 3_600_000;
const NOW = Date.now();
const START = NOW - DAYS * 24 * HOUR;
const USERS = Array.from({ length: 40 }, (_, i) => `user_${String(i + 1).padStart(3, "0")}`);

const kv = (obj) =>
  Object.entries(obj).filter(([, v]) => v !== undefined && v !== "").map(([key, v]) => ({
    key,
    value: typeof v === "number" ? (Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }) : typeof v === "boolean" ? { boolValue: v } : { stringValue: String(v) },
  }));
const messages = (list) => JSON.stringify(list.map(([role, content]) => ({ role, parts: [{ type: "text", content }] })));

/** Collected spans, grouped by service + environment (one OTLP resource each). */
const buffers = new Map();
let sent = 0;

function emit(service, environment, span) {
  const key = `${service}|${environment}`;
  if (!buffers.has(key)) buffers.set(key, []);
  buffers.get(key).push(span);
}

function span({ traceId, parent, name, kind = 1, start, ms, attrs = {}, error }) {
  const spanId = hexId(8);
  return {
    spanId,
    otlp: {
      traceId, spanId, parentSpanId: parent || "", name, kind,
      startTimeUnixNano: String(BigInt(Math.round(start)) * 1_000_000n),
      endTimeUnixNano: String(BigInt(Math.round(start + ms)) * 1_000_000n),
      attributes: kv(attrs),
      status: error ? { code: 2, message: error } : { code: 1 },
      events: error ? [{ name: "exception", timeUnixNano: String(BigInt(Math.round(start + ms)) * 1_000_000n), attributes: kv({ "exception.type": "APIError", "exception.message": error }) }] : [],
    },
  };
}

function llm({ service, env, traceId, parent, start, provider, model, input, output, inTok, outTok, ms, session, user, error, temperature = 0.2 }) {
  const s = span({
    traceId, parent, name: `chat ${model}`, kind: 3, start, ms, error,
    attrs: {
      "gen_ai.operation.name": "chat", "gen_ai.provider.name": provider, "gen_ai.request.model": model, "gen_ai.response.model": model,
      "gen_ai.request.temperature": temperature, "gen_ai.usage.input_tokens": error ? 0 : inTok, "gen_ai.usage.output_tokens": error ? 0 : outTok,
      "gen_ai.response.finish_reasons": error ? undefined : "stop", "gen_ai.input.messages": messages(input),
      "gen_ai.output.messages": error ? undefined : messages([["assistant", output]]), "session.id": session, "user.id": user,
      "error.type": error ? "APIError" : undefined,
    },
  });
  emit(service, env, s.otlp);
  return s;
}

/* ---------- workloads ---------- */

const FAQ = [
  ["How do I reset my password?", "Open Settings, choose Security, then Reset password. We email you a link that stays valid for 30 minutes."],
  ["Where is my invoice?", "Invoices are under Billing → History. Each one downloads as a PDF."],
  ["Can I change my plan mid-month?", "Yes. Upgrades apply immediately and are prorated; downgrades apply at the next renewal."],
  ["Do you offer refunds?", "We refund annual plans within 14 days of purchase. Monthly plans can be cancelled any time."],
];
const FOLLOWUPS = ["That didn't work, the link expired.", "Can you send it to a different email?", "Thanks. One more thing: how do I add a teammate?", "Is there a limit on seats?", "OK, and what about SSO?"];
const SUPPORT_SYSTEM = "You are the support assistant for Northwind Cloud. Answer briefly and only from the help centre.";

function supportSession(t, env) {
  const session = `sess_${hexId(6)}`;
  const user = pick(USERS);
  const turns = int(1, 6);
  const history = [["system", SUPPORT_SYSTEM]];
  let at = t;
  for (let i = 0; i < turns; i++) {
    const [q, a] = i === 0 ? pick(FAQ) : [pick(FOLLOWUPS), "Here is what to do next: " + pick(FAQ)[1]];
    history.push(["user", q]);
    const traceId = hexId(16);
    const ms = between(450, 1600);
    const root = span({ traceId, name: "POST /chat", kind: 2, start: at, ms: ms + 40, attrs: { "http.request.method": "POST", "http.route": "/chat", "session.id": session, "user.id": user } });
    emit("support-bot", env, root.otlp);
    const inTok = 60 + history.length * 45;
    llm({ service: "support-bot", env, traceId, parent: root.spanId, start: at + 20, provider: "openai", model: "gpt-4o-mini", input: [...history], output: a, inTok, outTok: int(40, 140), ms, session, user });
    history.push(["assistant", a]);
    at += between(8_000, 70_000);
  }
}

const TOPICS = ["EU AI Act obligations for deployers", "pricing of vector databases in 2026", "open-weight models under 10B parameters", "prompt caching across providers", "evaluating RAG faithfulness"];

function researchRun(t, env, { runaway = false } = {}) {
  const session = `sess_${hexId(6)}`;
  const user = runaway ? "user_017" : pick(USERS);
  const model = runaway ? "claude-opus-4" : "claude-sonnet-4";
  const topic = pick(TOPICS);
  const traceId = hexId(16);
  const steps = runaway ? int(9, 14) : int(2, 5);
  let at = t + 15;
  const children = [];
  let context = 900;
  for (let i = 0; i < steps; i++) {
    const last = i === steps - 1;
    const ms = between(1800, 5200) * (runaway ? 1.3 : 1);
    const outTok = last ? int(500, 900) : int(80, 220);
    children.push(() => {});
    const call = { at, ms, inTok: Math.round(context), outTok, last };
    at += ms + 30;
    if (!last) {
      const toolMs = between(300, 1400);
      call.tool = { at, ms: toolMs, name: chance(0.6) ? "web_search" : "fetch_page" };
      at += toolMs + 20;
      if (chance(0.5)) {
        const rMs = between(40, 180);
        call.retrieval = { at, ms: rMs };
        at += rMs + 10;
      }
      context += between(900, 2600) * (runaway ? 1.6 : 1);
    }
    children[i] = call;
  }
  const root = span({
    traceId, name: "invoke_agent research-agent", start: t, ms: at - t + 20,
    attrs: { "gen_ai.operation.name": "invoke_agent", "gen_ai.agent.name": "research-agent", "session.id": session, "user.id": user, "tracely.input": `Research: ${topic}` },
  });
  emit("research-agent", env, root.otlp);
  children.forEach((c, i) => {
    llm({
      service: "research-agent", env, traceId, parent: root.spanId, start: c.at, provider: "anthropic", model, ms: c.ms, session, user, temperature: 0.4,
      input: [["system", "You are a research agent. Plan, search, read, then answer with sources."], ["user", `Research: ${topic}`], ...(i ? [["user", `(${i} tool results so far)`]] : [])],
      output: c.last ? `Summary of findings on ${topic}: three developments stand out, with sources attached.` : `I should look up more detail on ${topic}. Calling ${c.tool.name}.`,
      inTok: c.inTok, outTok: c.outTok,
    });
    if (c.tool) {
      emit("research-agent", env, span({
        traceId, parent: root.spanId, name: `execute_tool ${c.tool.name}`, start: c.tool.at, ms: c.tool.ms,
        attrs: { "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": c.tool.name, "gen_ai.tool.call.arguments": JSON.stringify({ query: topic }), "gen_ai.tool.call.result": JSON.stringify({ results: int(3, 10) }), "session.id": session, "user.id": user },
      }).otlp);
    }
    if (c.retrieval) {
      emit("research-agent", env, span({
        traceId, parent: root.spanId, name: "query notes", kind: 3, start: c.retrieval.at, ms: c.retrieval.ms,
        attrs: { "db.system.name": "qdrant", "db.operation.name": "query", "db.collection.name": "notes", "session.id": session, "user.id": user },
      }).otlp);
    }
  });
}

const INTENTS = ["Classify this message as billing, shipping, or other: 'Where is my parcel?'", "Is this address complete? '12 High St'", "Extract the coupon code from: 'use SPRING20 at checkout'", "Does this cart need age verification? Items: sparkling water, crisps"];

function checkoutCall(t, env, { slow = false, failing = false } = {}) {
  const traceId = hexId(16);
  // Most requests carry something unique; the rest are exact repeats a cache could serve.
  const q = pick(INTENTS) + (chance(0.7) ? ` (order ${hexId(3)})` : "");
  llm({
    service: "checkout-assistant", env, traceId, start: t, provider: "openai", model: "gpt-4o", user: pick(USERS),
    input: [["system", "Answer in one word or one short line."], ["user", q]], output: pick(["shipping", "No, postcode missing", "SPRING20", "no"]),
    inTok: int(90, 260), outTok: int(3, 30), ms: slow ? between(6000, 14000) : between(350, 1100), temperature: 0,
    error: failing ? "503 The server is overloaded. Retry your request." : undefined,
  });
}

const SUMMARY_PREFIX = ("You are a contracts analyst. Summarise the document for a busy reader. Rules: keep defined terms exactly as written; " +
  "list obligations per party; flag unusual indemnities, liability caps, auto-renewal, and termination notice periods; never invent clauses. ").repeat(11);

function summarize(t, env, { failing = false } = {}) {
  const traceId = hexId(16);
  const user = pick(USERS);
  const root = span({ traceId, name: "summarize_document", start: t, ms: failing ? 900 : between(4200, 9000), attrs: { "user.id": user, "document.pages": int(8, 60) } });
  emit("doc-summarizer", env, root.otlp);
  emit("doc-summarizer", env, span({
    traceId, parent: root.spanId, name: "embeddings text-embedding-3-small", kind: 3, start: t + 10, ms: between(60, 200),
    attrs: { "gen_ai.operation.name": "embeddings", "gen_ai.provider.name": "openai", "gen_ai.request.model": "text-embedding-3-small", "gen_ai.usage.input_tokens": int(2000, 9000), "user.id": user },
  }).otlp);
  llm({
    service: "doc-summarizer", env, traceId, parent: root.spanId, start: t + 260, provider: "openai", model: "gpt-4.1", user,
    input: [["system", SUMMARY_PREFIX], ["user", `Document ${hexId(3)}: MASTER SERVICES AGREEMENT between Northwind Cloud Ltd and the Customer …`]],
    output: "Parties and term, then obligations per party, then three flagged clauses: liability cap, auto-renewal, 90-day notice.",
    inTok: int(7000, 12500), outTok: int(150, 320), ms: failing ? between(300, 700) : between(3800, 8500),
    error: failing ? "429 Rate limit reached for gpt-4.1 on tokens per min (TPM)" : undefined,
  });
}

/* ---------- schedule ---------- */

const diurnal = (t) => {
  const h = new Date(t).getUTCHours();
  const weekday = ![0, 6].includes(new Date(t).getUTCDay());
  return (0.35 + 0.65 * Math.max(0, Math.sin(((h - 6) / 14) * Math.PI))) * (weekday ? 1 : 0.55);
};
const env = () => (chance(0.9) ? "production" : "staging");
const within = (t, hoursAgoFrom, hoursAgoTo) => t <= NOW - hoursAgoTo * HOUR && t >= NOW - hoursAgoFrom * HOUR;

async function flush(force = false) {
  for (const [key, spans] of buffers) {
    while (spans.length >= 400 || (force && spans.length)) {
      const batch = spans.splice(0, 400);
      const [service, environment] = key.split("|");
      const res = await fetch(`${URL_BASE}/api/otlp/v1/traces`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          resourceSpans: [{
            resource: { attributes: kv({ "service.name": service, "deployment.environment.name": environment, "telemetry.sdk.name": "tracely-seed" }) },
            scopeSpans: [{ scope: { name: "tracely.seed" }, spans: batch }],
          }],
        }),
      });
      if (!res.ok) throw new Error(`Ingest failed: ${res.status} ${await res.text()}`);
      sent += batch.length;
    }
  }
}

for (let hour = START; hour < NOW; hour += HOUR) {
  const load = diurnal(hour);
  const at = () => Math.min(hour + rnd() * HOUR, NOW - 5_000);
  const times = (base) => Math.round(base * load * between(0.8, 1.2));

  for (let i = times(9); i > 0; i--) supportSession(at(), env());
  for (let i = times(3); i > 0; i--) researchRun(at(), env());
  for (let i = times(26); i > 0; i--) checkoutCall(at(), env(), { slow: within(hour, 31, 28) && chance(0.5), failing: within(hour, 76, 73) && chance(0.4) });
  for (let i = times(5); i > 0; i--) summarize(at(), env(), { failing: within(hour, 76, 73) && chance(0.6) });

  // Spend spike: one user's agent loops on the largest model for a few hours.
  if (within(hour, 9, 5)) for (let i = int(5, 8); i > 0; i--) researchRun(at(), "production", { runaway: true });

  await flush();
}
await flush(true);
console.log(`Sent ${sent.toLocaleString("en-US")} spans covering ${DAYS} days to ${URL_BASE}`);
