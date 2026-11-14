import { query, SPANS } from "./clickhouse";
import { where } from "./queries";
import { findPrice } from "./pricing";
import type { Scope } from "./time";
import { lastUserMessage } from "./messages";

/**
 * Cost optimizer: turns observed traffic into savings recommendations.
 * Every figure is measured in the selected range and then scaled to 30 days;
 * each recommendation states the assumption behind its estimate.
 */

export type Recommendation = {
  id: "downgrade" | "duplicates" | "prefix" | "failures" | "context";
  title: string;
  detail: string;
  assumption: string;
  monthlySavings: number;
  affectedCalls: number;
  evidence: { label: string; value: string; note?: string; href?: string }[];
};

const n = (v: unknown) => Number(v) || 0;
const CHAT = "span_type = 'llm'";

export async function recommendations(scope: Scope): Promise<{ items: Recommendation[]; monthlySpend: number }> {
  const scale = (30 * 86_400_000) / (scope.to - scope.from);
  const w = where(scope, [CHAT]);
  const money = (v: number) => "$" + (v < 1 ? v.toFixed(2) : Math.round(v).toLocaleString("en-US"));

  const [simple, dupes, prefixes, failures, context, spend] = await Promise.all([
    // 1. Short, simple calls on a model that has a cheaper sibling.
    query<Record<string, unknown>>(
      `SELECT model, count() AS calls, sum(cost) AS spend, sum(input_tokens) AS in_tok, sum(output_tokens) AS out_tok
       FROM ${SPANS} WHERE ${w.sql} AND status_code != 'ERROR' AND input_tokens <= 1500 AND output_tokens <= 200 AND model != ''
       GROUP BY model HAVING calls >= 20 ORDER BY spend DESC LIMIT 20`,
      w.params,
    ),
    // 2. Byte-identical prompts sent more than once to the same model.
    query<Record<string, unknown>>(
      `SELECT sum(copies - 1) AS repeats, sum(spend - spend / copies) AS wasted, count() AS groups, argMax(sample, copies) AS sample, max(copies) AS worst
       FROM (
         SELECT cityHash64(model, input) AS h, count() AS copies, sum(cost) AS spend, any(substring(input, 1, 4000)) AS sample
         FROM ${SPANS} WHERE ${w.sql} AND status_code != 'ERROR' AND input != '' GROUP BY h HAVING copies > 1
       )`,
      w.params,
    ),
    // 3. Long prompts that share the same opening: candidates for provider prompt caching.
    query<Record<string, unknown>>(
      `SELECT model, service_name, count() AS calls, avg(input_tokens) AS avg_input, sum(input_tokens) AS in_tok
       FROM ${SPANS} WHERE ${w.sql} AND status_code != 'ERROR' AND input_tokens >= 1024 AND length(input) >= 2000
       GROUP BY model, service_name, cityHash64(substring(input, 1, 2000)) HAVING calls >= 10 ORDER BY in_tok DESC LIMIT 10`,
      w.params,
    ),
    // 4. Money spent on calls that failed.
    query<Record<string, unknown>>(
      `SELECT service_name, model, count() AS calls, sum(cost) AS spend, any(status_message) AS message
       FROM ${SPANS} WHERE ${w.sql} AND status_code = 'ERROR' GROUP BY service_name, model ORDER BY calls DESC LIMIT 5`,
      w.params,
    ),
    // 5. Very large inputs producing very small outputs.
    query<Record<string, unknown>>(
      `SELECT service_name, model, count() AS calls, avg(input_tokens) AS avg_input, avg(output_tokens) AS avg_output, sum(input_tokens) AS in_tok
       FROM ${SPANS} WHERE ${w.sql} AND status_code != 'ERROR' AND input_tokens >= 6000 AND input_tokens >= output_tokens * 20
       GROUP BY service_name, model HAVING calls >= 10 ORDER BY in_tok DESC LIMIT 5`,
      w.params,
    ),
    query<Record<string, unknown>>(`SELECT sum(cost) AS spend FROM ${SPANS} WHERE ${where(scope).sql}`, where(scope).params),
  ]);

  const items: Recommendation[] = [];
  const base = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(scope.range !== "24h" ? { range: scope.range } : {}), ...(scope.env ? { env: scope.env } : {}), ...extra });
    return `/traces?${p}`;
  };

  // 1. downgrade
  {
    let savings = 0;
    let calls = 0;
    const evidence: Recommendation["evidence"] = [];
    for (const r of simple) {
      const price = findPrice(String(r.model));
      const alt = price?.cheaper ? findPrice(price.cheaper) : null;
      if (!price || !alt) continue;
      const altCost = (n(r.in_tok) * alt.input + n(r.out_tok) * alt.output) / 1e6;
      const saved = (n(r.spend) - altCost) * scale;
      if (saved <= 0) continue;
      savings += saved;
      calls += n(r.calls);
      evidence.push({ label: `${r.model} → ${alt.key}`, value: `${money(saved)}/mo`, note: `${n(r.calls).toLocaleString("en-US")} short calls`, href: base({ model: String(r.model) }) });
    }
    if (savings > 0) {
      items.push({
        id: "downgrade",
        title: "Route short, simple calls to a smaller model",
        detail: "These calls have small prompts and short answers, the kind of work a smaller model in the same family usually handles. Test quality on a sample before switching.",
        assumption: "Counts successful calls with at most 1,500 input and 200 output tokens, repriced at the smaller model's rate.",
        monthlySavings: savings, affectedCalls: calls, evidence: evidence.slice(0, 5),
      });
    }
  }

  // 2. duplicates
  {
    const d = dupes[0];
    const wasted = n(d?.wasted) * scale;
    if (n(d?.repeats) > 0 && wasted > 0) {
      items.push({
        id: "duplicates",
        title: "Cache answers to repeated prompts",
        detail: "The same prompt was sent to the same model more than once. A response cache keyed on model and prompt would serve the repeats for free.",
        assumption: "Counts byte-identical prompts only and assumes every repeat could be served from cache.",
        monthlySavings: wasted, affectedCalls: n(d.repeats),
        evidence: [
          { label: "Repeated calls", value: n(d.repeats).toLocaleString("en-US"), note: `across ${n(d.groups).toLocaleString("en-US")} distinct prompts` },
          { label: "Most repeated prompt", value: `${n(d.worst)}×`, note: (lastUserMessage(String(d.sample || "")) || String(d.sample || "")).replace(/\s+/g, " ").slice(0, 140) },
        ],
      });
    }
  }

  // 3. prefix caching
  {
    let savings = 0;
    let calls = 0;
    const evidence: Recommendation["evidence"] = [];
    for (const r of prefixes) {
      const price = findPrice(String(r.model));
      if (!price) continue;
      // Assume half of the input is the shared prefix and cached reads cost 10-50% of normal; use a 50% discount.
      const saved = ((n(r.in_tok) * 0.5 * price.input) / 1e6) * 0.5 * scale;
      savings += saved;
      calls += n(r.calls);
      evidence.push({ label: `${r.service_name} on ${r.model}`, value: `${money(saved)}/mo`, note: `${n(r.calls).toLocaleString("en-US")} calls, ${Math.round(n(r.avg_input)).toLocaleString("en-US")} input tokens each` });
    }
    if (savings > 0) {
      items.push({
        id: "prefix",
        title: "Turn on prompt caching for shared prompt openings",
        detail: "Many long prompts start with the same text, typically a system prompt or tool list. Provider prompt caching bills that repeated opening at a reduced rate.",
        assumption: "Assumes half of each prompt is the shared opening and cached input costs 50% less. Real discounts vary by provider.",
        monthlySavings: savings, affectedCalls: calls, evidence: evidence.slice(0, 5),
      });
    }
  }

  // 4. failures
  {
    const cost = failures.reduce((s, r) => s + n(r.spend), 0) * scale;
    const calls = failures.reduce((s, r) => s + n(r.calls), 0);
    if (calls > 0) {
      items.push({
        id: "failures",
        title: "Stop paying for calls that fail",
        detail: "Failed calls still cost tokens when they error mid-response, and each one usually triggers a retry. Fix the top error first.",
        assumption: "Counts the recorded cost of failed calls; retries they triggered are not included.",
        monthlySavings: cost, affectedCalls: calls,
        evidence: failures.map((r) => ({
          label: `${r.service_name} on ${r.model || "unknown model"}`, value: `${n(r.calls).toLocaleString("en-US")} failed`,
          note: String(r.message || "").slice(0, 120), href: base({ status: "error", service: String(r.service_name) }),
        })),
      });
    }
  }

  // 5. oversized context
  {
    let savings = 0;
    let calls = 0;
    const evidence: Recommendation["evidence"] = [];
    for (const r of context) {
      const price = findPrice(String(r.model));
      if (!price) continue;
      const saved = ((n(r.in_tok) * 0.3 * price.input) / 1e6) * scale;
      savings += saved;
      calls += n(r.calls);
      evidence.push({
        label: `${r.service_name} on ${r.model}`, value: `${money(saved)}/mo`,
        note: `${Math.round(n(r.avg_input)).toLocaleString("en-US")} tokens in, ${Math.round(n(r.avg_output)).toLocaleString("en-US")} out per call`,
        href: base({ service: String(r.service_name), model: String(r.model) }),
      });
    }
    if (savings > 0) {
      items.push({
        id: "context",
        title: "Trim oversized context",
        detail: "These calls send thousands of tokens to get a few back. Retrieve fewer documents, summarise history, or drop unused tool definitions.",
        assumption: "Assumes 30% of the input could be removed without changing the answer.",
        monthlySavings: savings, affectedCalls: calls, evidence,
      });
    }
  }

  items.sort((a, b) => b.monthlySavings - a.monthlySavings);
  return { items, monthlySpend: n(spend[0]?.spend) * scale };
}
