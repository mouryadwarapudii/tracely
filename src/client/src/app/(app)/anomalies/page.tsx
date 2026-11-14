import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { RANGES, scopeFrom } from "@/lib/time";
import { findAnomalies, type Metric } from "@/lib/anomalies";
import { dateTime } from "@/lib/format";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { FlaggedLine, type Unit } from "@/components/charts";

export const metadata = { title: "Anomalies" };

const METRICS: { key: Metric; label: string; unit: Unit }[] = [
  { key: "cost", label: "Spend per hour", unit: "usd" },
  { key: "latency", label: "p95 latency", unit: "ms" },
  { key: "errors", label: "Error rate", unit: "pct" },
];
const DIM: Record<string, string> = { model: "model", service_name: "service", user_id: "user" };

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { project } = await requireSession();
  const scope = scopeFrom(project.id, await searchParams);
  // Detection is hourly, so the shortest useful window is a day.
  const from = Math.min(scope.from, scope.to - 24 * 3_600_000);
  const { incidents, points } = await findAnomalies(project.id, from, Date.now(), scope.env);
  const windowLabel = scope.range === "1h" ? "24 hours" : RANGES[scope.range].label;

  return (
    <>
      <PageHeader title="Anomalies" description={`Hours in the last ${windowLabel} where spend, latency, or errors ran well above the previous seven days. Tracely finds these on its own; there are no thresholds to configure.`}
        actions={<Link className="btn" href="/alerts">Get notified</Link>} />

      <div className="grid gap-4 lg:grid-cols-3">
        {METRICS.map((m) => (
          <Panel key={m.key} title={m.label} hint={`${points.filter((p) => p.flags.includes(m.key)).length} unusual hours`}>
            <FlaggedLine name={m.label} unit={m.unit} points={points.map((p) => ({ t: p.t, value: p[m.key], flagged: p.flags.includes(m.key) }))} />
          </Panel>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-3">
        <svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--critical)" strokeWidth="1.5" /><circle cx="8" cy="8" r="3" fill="var(--critical)" /></svg>
        marks an unusual hour
      </p>

      <Panel title="Incidents" className="mt-4" flush>
        {incidents.length === 0 ? (
          <p className="p-4 text-ink-2">No anomalies in the last {windowLabel}. Detection needs at least a day of history to compare against.</p>
        ) : (
          <ul className="divide-y divide-line">
            {incidents.map((i) => {
              const filter = i.contributor ? `&${i.contributor.dimension === "service_name" ? "service" : i.contributor.dimension === "user_id" ? "user" : "model"}=${encodeURIComponent(i.contributor.value)}` : "";
              return (
                <li key={i.id} className="grid gap-x-6 gap-y-2 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={i.severity === "critical" ? "critical" : "warning"} icon>{i.severity === "critical" ? "Critical" : "Warning"}</Badge>
                      {i.ongoing && <Badge tone="accent">Ongoing</Badge>}
                      <h3 className="font-semibold">{i.title}</h3>
                    </div>
                    <p className="mt-1 max-w-[80ch] text-ink-2">{i.summary}</p>
                    <p className="mt-1 text-[13px] text-ink-3">
                      {dateTime(i.start)} to {dateTime(i.end)}
                      {i.contributor && <>, traced to {DIM[i.contributor.dimension]} <span className="font-medium text-ink-2">{i.contributor.value}</span></>}
                    </p>
                  </div>
                  <Link className="btn btn-sm" href={`/traces?range=7d${i.metric === "errors" ? "&status=error" : ""}${filter}`}>View traces</Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
