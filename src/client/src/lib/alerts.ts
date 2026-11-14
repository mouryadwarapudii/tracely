import { budgetStatuses } from "./budgets";
import { findAnomalies } from "./anomalies";
import { defaultProject, listChannels, markDelivered, recordAlert, type AlertChannel, type AlertEvent } from "./db";
import { usd } from "./format";

/**
 * Alert evaluation. Runs on a timer inside the server (see instrumentation.ts)
 * and on demand via POST /api/cron/evaluate. Each condition fires once: the
 * dedupe key ties a budget alert to its period and level, and an anomaly
 * alert to the hour the incident began.
 */

const baseUrl = () => (process.env.TRACELY_PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");

async function deliver(channel: AlertChannel, event: AlertEvent): Promise<boolean> {
  const link = event.link ? baseUrl() + event.link : baseUrl();
  const body =
    channel.type === "slack"
      ? { text: `*${event.title}*\n${event.body}\n<${link}|Open in Tracely>` }
      : { id: event.id, kind: event.kind, severity: event.severity, title: event.title, body: event.body, url: link, created_at: new Date(event.created_at).toISOString() };
  try {
    const res = await fetch(channel.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fire(event: Omit<AlertEvent, "id" | "created_at" | "delivered">): Promise<boolean> {
  const created = recordAlert(event);
  if (!created) return false;
  const results = await Promise.all(listChannels(event.project_id).map((c) => deliver(c, created)));
  markDelivered(created.id, results.filter(Boolean).length);
  return true;
}

export async function sendTest(channel: AlertChannel): Promise<boolean> {
  return deliver(channel, {
    id: "test", project_id: channel.project_id, kind: "budget", severity: "info", title: "Test alert from Tracely",
    body: "This channel is connected. Budget and anomaly alerts will arrive here.", link: "/alerts", dedupe_key: "test", delivered: 0, created_at: Date.now(),
  });
}

export async function evaluateAlerts(projectId = defaultProject().id): Promise<{ fired: number }> {
  let fired = 0;
  const now = Date.now();

  for (const b of await budgetStatuses(projectId, now)) {
    if (b.state === "ok") continue;
    const scope = b.scope_type === "all" ? "all spend" : `${b.scope_type} ${b.scope_value}`;
    const message = {
      exceeded: { severity: "critical" as const, title: `Budget exceeded: ${b.name}`, body: `${usd(b.spent)} spent of the ${usd(b.amount)} ${b.period} budget for ${scope}.` },
      warning: { severity: "warning" as const, title: `Budget at ${Math.round((b.spent / b.amount) * 100)}%: ${b.name}`, body: `${usd(b.spent)} spent of the ${usd(b.amount)} ${b.period} budget for ${scope}.` },
      forecast: { severity: "warning" as const, title: `Budget on track to be exceeded: ${b.name}`, body: `At the current rate, ${scope} reaches ${usd(b.forecast)} against a ${usd(b.amount)} ${b.period} budget.` },
    }[b.state];
    if (await fire({ project_id: projectId, kind: "budget", ...message, link: "/budgets", dedupe_key: `budget:${b.id}:${b.periodStart}:${b.state}` })) fired++;
  }

  const { incidents } = await findAnomalies(projectId, now - 6 * 3_600_000, now);
  for (const i of incidents) {
    if (await fire({ project_id: projectId, kind: "anomaly", severity: i.severity, title: i.title, body: i.summary, link: "/anomalies", dedupe_key: `anomaly:${i.id}` })) fired++;
  }
  return { fired };
}
