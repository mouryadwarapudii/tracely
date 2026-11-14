import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { carry, one, RANGES, scopeFrom } from "@/lib/time";
import { filterOptions, traces, type TraceFilter } from "@/lib/queries";
import { compact, dateTime, duration, usd } from "@/lib/format";
import { Badge, Empty, Mono, PageHeader, Pager, Panel } from "@/components/ui";

export const metadata = { title: "Traces" };

export default async function TracesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { project } = await requireSession();
  const search = await searchParams;
  const scope = scopeFrom(project.id, search);
  const filter: TraceFilter = { status: one(search.status), model: one(search.model), service: one(search.service), q: one(search.q).trim(), session: one(search.session), user: one(search.user) };
  const page = Math.max(0, Number(one(search.page)) || 0);
  const [{ rows, more }, options] = await Promise.all([traces(scope, filter, page), filterOptions(scope)]);
  const filtered = Object.values(filter).some(Boolean);
  const extra = Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) as Record<string, string>;

  return (
    <>
      <PageHeader title="Traces" description="One row per request or agent run, with every model call, tool call, and retrieval inside it." />

      <Panel flush>
        <form className="flex flex-wrap items-center gap-2 border-b border-line p-3" action="/traces">
          {scope.range !== "24h" && <input type="hidden" name="range" value={scope.range} />}
          {scope.env && <input type="hidden" name="env" value={scope.env} />}
          <input className="field !w-[260px] max-w-full" name="q" defaultValue={filter.q} placeholder="Search names, prompts, responses" aria-label="Search" />
          <select className="field !w-auto" name="status" defaultValue={filter.status} aria-label="Status">
            <option value="">Any status</option><option value="error">Failed</option><option value="ok">Succeeded</option>
          </select>
          <select className="field !w-auto" name="model" defaultValue={filter.model} aria-label="Model">
            <option value="">Any model</option>{options.models.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className="field !w-auto" name="service" defaultValue={filter.service} aria-label="Service">
            <option value="">Any service</option>{options.services.map((m) => <option key={m}>{m}</option>)}
          </select>
          <button className="btn">Apply filters</button>
          {filtered && <Link className="btn btn-quiet" href={`/traces${carry(scope)}`}>Clear</Link>}
          {(filter.session || filter.user) && <span className="text-[13px] text-ink-3">{filter.session ? `Session ${filter.session}` : `User ${filter.user}`}</span>}
        </form>

        {rows.length === 0 ? (
          <Empty title={filtered ? "No traces match these filters" : "No traces in this range"}>
            {filtered ? "Loosen a filter or widen the time range." : `Nothing arrived in the last ${RANGES[scope.range].label}. Widen the time range, or check that your app is sending data.`}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr><th>Trace</th><th>Started</th><th>Service</th><th>Models</th><th className="r">Duration</th><th className="r">Calls</th><th className="r">Tokens</th><th className="r">Cost</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.trace_id}>
                    <td className="max-w-[280px]">
                      <Link href={`/traces/${t.trace_id}`} className="block truncate font-medium hover:text-accent hover:underline">{t.name}</Link>
                      <Mono className="text-ink-3">{t.trace_id.slice(0, 16)}</Mono>
                    </td>
                    <td className="num whitespace-nowrap text-ink-2">{dateTime(t.started)}</td>
                    <td className="whitespace-nowrap">{t.service}</td>
                    <td className="max-w-[200px] truncate text-ink-2">{t.models.join(", ") || "None"}</td>
                    <td className="r num whitespace-nowrap">{duration(t.duration_ms)}</td>
                    <td className="r num">{t.llm_calls}</td>
                    <td className="r num">{compact(t.tokens)}</td>
                    <td className="r num">{usd(t.cost)}</td>
                    <td>{t.errors ? <Badge tone="critical" icon>Failed</Badge> : <Badge tone="good" icon>OK</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} more={more} hrefFor={(p) => `/traces${carry(scope, { ...extra, page: p ? String(p) : undefined })}`} />
      </Panel>
    </>
  );
}
