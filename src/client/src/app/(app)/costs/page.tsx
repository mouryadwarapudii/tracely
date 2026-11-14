import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { carry, RANGES, scopeFrom } from "@/lib/time";
import { breakdown, costByModelSeries, totals, type Breakdown } from "@/lib/queries";
import { compact, duration, pct, usd } from "@/lib/format";
import { BarList, Empty, PageHeader, Panel, StatStrip } from "@/components/ui";
import { StackedSpend } from "@/components/charts";

export const metadata = { title: "Costs" };

export default async function CostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { project } = await requireSession();
  const scope = scopeFrom(project.id, await searchParams);
  const [now, spend, models, services, users, providers] = await Promise.all([
    totals(scope), costByModelSeries(scope, 4), breakdown(scope, "model", 25), breakdown(scope, "service_name", 8), breakdown(scope, "user_id", 8), breakdown(scope, "provider", 8),
  ]);
  const monthly = (now.cost * 30 * 86_400_000) / (scope.to - scope.from);

  return (
    <>
      <PageHeader title="Costs" description={`Where the money went in the last ${RANGES[scope.range].label}. Cost is computed from token counts and the price list in Settings.`}
        actions={<Link className="btn" href={`/optimizer${carry(scope)}`}>Find savings</Link>} />
      <StatStrip
        stats={[
          { label: "Spend", value: usd(now.cost) },
          { label: "Projected per month", value: usd(monthly, { compact: true }), note: "at this range's rate" },
          { label: "Average per call", value: usd(now.requests ? now.cost / now.requests : 0) },
          { label: "Input tokens", value: compact(now.input_tokens) },
          { label: "Output tokens", value: compact(now.output_tokens) },
        ]}
      />

      <Panel title="Spend over time" className="mt-4">
        <StackedSpend points={spend.points} models={spend.models} bucket={scope.bucket} height={280} />
      </Panel>

      <Panel title="By model" className="mt-4" flush>
        {models.length === 0 ? <Empty title="No model calls in this range" /> : <ModelTable rows={models} total={now.cost} q={(m) => `/traces${carry(scope, { model: m })}`} />}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="By service"><BarList format={usd} rows={services.map((r) => ({ key: r.key, value: r.cost, href: `/traces${carry(scope, { service: r.key })}` }))} /></Panel>
        <Panel title="By user" hint="Top spenders"><BarList format={usd} rows={users.map((r) => ({ key: r.key, value: r.cost, href: `/traces${carry(scope, { user: r.key })}` }))} /></Panel>
        <Panel title="By provider"><BarList format={usd} rows={providers.map((r) => ({ key: r.key, value: r.cost }))} /></Panel>
      </div>
    </>
  );
}

function ModelTable({ rows, total, q }: { rows: Breakdown[]; total: number; q: (model: string) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="data">
        <thead><tr><th>Model</th><th className="r">Spend</th><th className="r">Share</th><th className="r">Calls</th><th className="r">Per call</th><th className="r">Input tokens</th><th className="r">Output tokens</th><th className="r">p95 latency</th><th className="r">Errors</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td><Link className="font-medium hover:text-accent hover:underline" href={q(r.key)}>{r.key}</Link></td>
              <td className="r num font-medium">{usd(r.cost)}</td>
              <td className="r num">{total ? pct(r.cost / total, 0) : "0%"}</td>
              <td className="r num">{compact(r.requests)}</td>
              <td className="r num">{usd(r.requests ? r.cost / r.requests : 0)}</td>
              <td className="r num">{compact(r.input_tokens)}</td>
              <td className="r num">{compact(r.output_tokens)}</td>
              <td className="r num">{duration(r.p95_ms)}</td>
              <td className="r num">{r.requests ? pct(r.errors / r.requests) : "0%"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
