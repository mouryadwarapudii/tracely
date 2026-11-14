import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { carry, RANGES, scopeFrom } from "@/lib/time";
import { breakdown, costByModelSeries, hasAnyData, series, totals } from "@/lib/queries";
import { findAnomalies } from "@/lib/anomalies";
import { budgetStatuses } from "@/lib/budgets";
import { recommendations } from "@/lib/optimizer";
import { compact, duration, pct, usd, ago } from "@/lib/format";
import { Badge, BarList, PageHeader, Panel, StatStrip } from "@/components/ui";
import { StackedSpend, Trend } from "@/components/charts";
import { Onboarding } from "@/components/onboarding";

export const metadata = { title: "Overview" };

const change = (now: number, before: number) => (before > 0 ? (now - before) / before : now > 0 ? Infinity : 0);

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { project } = await requireSession();
  const scope = scopeFrom(project.id, await searchParams);
  if (!(await hasAnyData(project.id))) {
    return (<><PageHeader title="Overview" /><Onboarding /></>);
  }

  const previous = { ...scope, from: scope.from - (scope.to - scope.from), to: scope.from };
  const [now, before, points, spend, models, services, anomalies, budgets, optimizer] = await Promise.all([
    totals(scope), totals(previous), series(scope), costByModelSeries(scope), breakdown(scope, "model", 6), breakdown(scope, "service_name", 6),
    findAnomalies(project.id, Date.now() - 24 * 3_600_000, Date.now(), scope.env), budgetStatuses(project.id), recommendations(scope),
  ]);
  const errorRate = now.requests ? now.errors / now.requests : 0;
  const errorRateBefore = before.requests ? before.errors / before.requests : 0;
  const q = carry(scope);
  const atRisk = budgets.filter((b) => b.state !== "ok");
  const topSaving = optimizer.items[0];
  const attention = anomalies.incidents.length + atRisk.length;

  return (
    <>
      <PageHeader title="Overview" description={`Model calls across all services in the last ${RANGES[scope.range].label}.`} />

      <StatStrip
        stats={[
          { label: "Spend", value: usd(now.cost), delta: change(now.cost, before.cost), goodWhen: "down" },
          { label: "Model calls", value: compact(now.requests), delta: change(now.requests, before.requests) },
          { label: "Tokens", value: compact(now.tokens), delta: change(now.tokens, before.tokens) },
          { label: "p95 latency", value: duration(now.p95_ms), delta: change(now.p95_ms, before.p95_ms), goodWhen: "down" },
          { label: "Error rate", value: pct(errorRate), delta: change(errorRate, errorRateBefore), goodWhen: "down" },
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Spend by model" className="lg:col-span-2" action={<Link href={`/costs${q}`} className="text-[13px] font-medium text-accent hover:underline">Cost breakdown</Link>}>
          <StackedSpend points={spend.points} models={spend.models} bucket={scope.bucket} />
        </Panel>

        <Panel title="Needs attention" hint={attention ? "Last 24 hours and current budget periods" : undefined}>
          {attention === 0 && !topSaving ? (
            <p className="text-ink-2">Nothing unusual. No anomalies in the last 24 hours and every budget is on track.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {anomalies.incidents.slice(0, 3).map((i) => (
                <li key={i.id} className="py-2.5 first:pt-0">
                  <Link href="/anomalies" className="group block">
                    <div className="flex items-center gap-2">
                      <Badge tone={i.severity === "critical" ? "critical" : "warning"} icon>{i.ongoing ? "Ongoing" : ago(i.start)}</Badge>
                      <span className="font-medium group-hover:text-accent">{i.title}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-2">{i.summary}</p>
                  </Link>
                </li>
              ))}
              {atRisk.map((b) => (
                <li key={b.id} className="py-2.5 first:pt-0">
                  <Link href="/budgets" className="group block">
                    <div className="flex items-center gap-2">
                      <Badge tone={b.state === "exceeded" ? "critical" : "warning"} icon>Budget</Badge>
                      <span className="font-medium group-hover:text-accent">{b.name}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-2">
                      {b.state === "forecast" ? `On track for ${usd(b.forecast)} against ${usd(b.amount)} this period.` : `${usd(b.spent)} spent of ${usd(b.amount)} this period.`}
                    </p>
                  </Link>
                </li>
              ))}
              {topSaving && (
                <li className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={`/optimizer${q}`} className="group block">
                    <div className="flex items-center gap-2">
                      <Badge tone="accent">Saving</Badge>
                      <span className="font-medium group-hover:text-accent">{topSaving.title}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-2">Estimated {usd(topSaving.monthlySavings)} per month at the current rate.</p>
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Model calls">
          <Trend data={points} dataKey="requests" name="Calls" unit="count" bucket={scope.bucket} kind="bar" />
        </Panel>
        <Panel title="p95 latency">
          <Trend data={points} dataKey="p95_ms" name="p95 latency" unit="ms" bucket={scope.bucket} kind="line" />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Spend by model">
          <BarList format={usd} rows={models.map((m) => ({ key: m.key, value: m.cost, note: `${compact(m.requests)} ${m.requests === 1 ? "call" : "calls"}`, href: `/traces${carry(scope, { model: m.key })}` }))} />
        </Panel>
        <Panel title="Spend by service">
          <BarList format={usd} rows={services.map((m) => ({ key: m.key, value: m.cost, note: `${compact(m.requests)} ${m.requests === 1 ? "call" : "calls"}`, href: `/traces${carry(scope, { service: m.key })}` }))} />
        </Panel>
      </div>
    </>
  );
}
