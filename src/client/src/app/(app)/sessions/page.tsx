import Link from "next/link";
import { Play } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { carry, one, RANGES, scopeFrom } from "@/lib/time";
import { sessions } from "@/lib/queries";
import { compact, dateTime, duration, usd } from "@/lib/format";
import { Badge, Empty, Mono, PageHeader, Pager, Panel } from "@/components/ui";

export const metadata = { title: "Sessions" };

export default async function SessionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { project } = await requireSession();
  const search = await searchParams;
  const scope = scopeFrom(project.id, search);
  const page = Math.max(0, Number(one(search.page)) || 0);
  const { rows, more } = await sessions(scope, page);

  return (
    <>
      <PageHeader title="Sessions" description="Conversations and agent runs, grouped by session ID. Open one to replay it step by step." />
      <Panel flush>
        {rows.length === 0 ? (
          <Empty title="No sessions in this range">
            Sessions appear when spans carry a session ID. Wrap a conversation in <span className="font-mono text-[12.5px]">tracely.session(&quot;id&quot;)</span>, or set the <span className="font-mono text-[12.5px]">session.id</span> attribute yourself. Nothing matched in the last {RANGES[scope.range].label}.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Session</th><th>User</th><th>Service</th><th>Started</th><th className="r">Length</th><th className="r">Turns</th><th className="r">Model calls</th><th className="r">Tool calls</th><th className="r">Cost</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.session_id}>
                    <td><Link href={`/sessions/${encodeURIComponent(s.session_id)}`} className="hover:text-accent hover:underline"><Mono>{s.session_id}</Mono></Link></td>
                    <td>{s.user_id || <span className="text-ink-3">Unknown</span>}</td>
                    <td>{s.service}</td>
                    <td className="num whitespace-nowrap text-ink-2">{dateTime(s.started)}</td>
                    <td className="r num whitespace-nowrap">{duration(s.last - s.started)}</td>
                    <td className="r num">{s.traces}</td>
                    <td className="r num">{s.llm_calls}</td>
                    <td className="r num">{s.tool_calls}</td>
                    <td className="r num">{usd(s.cost)}</td>
                    <td>{s.errors ? <Badge tone="critical" icon>{s.errors} failed</Badge> : <Badge tone="good" icon>OK</Badge>}</td>
                    <td className="r"><Link className="btn btn-sm" href={`/sessions/${encodeURIComponent(s.session_id)}`}><Play size={13} />Replay</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} more={more} hrefFor={(p) => `/sessions${carry(scope, { page: p ? String(p) : undefined })}`} />
      </Panel>
      <p className="mt-2 text-[13px] text-ink-3">{compact(rows.length)} shown</p>
    </>
  );
}
