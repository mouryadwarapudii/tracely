import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { traceSpans } from "@/lib/queries";
import { compact, dateTime, duration, usd } from "@/lib/format";
import { Badge, Empty, Mono, Panel, StatStrip } from "@/components/ui";
import { Waterfall } from "@/components/waterfall";

export const metadata = { title: "Trace" };

export default async function TracePage({ params }: { params: Promise<{ traceId: string }> }) {
  const { project } = await requireSession();
  const { traceId } = await params;
  const spans = await traceSpans(project.id, traceId);
  if (!spans.length) {
    return (
      <Panel><Empty title="Trace not found" action={<Link className="btn" href="/traces">Back to traces</Link>}>
        No spans are stored under this trace ID. It may be older than the retention period.
      </Empty></Panel>
    );
  }
  const start = Math.min(...spans.map((s) => s.start));
  const end = Math.max(...spans.map((s) => s.start + s.duration_ms));
  const root = spans.find((s) => !s.parent_span_id) || spans[0];
  const errors = spans.filter((s) => s.status_code === "ERROR").length;
  const session = spans.find((s) => s.session_id)?.session_id;
  const user = spans.find((s) => s.user_id)?.user_id;

  return (
    <>
      <Link href="/traces" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-accent"><ChevronLeft size={15} />Traces</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-[22px] font-bold leading-tight tracking-tight">{root.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            <span>{dateTime(start)}</span>
            <span>{root.service_name}</span>
            <span>{root.environment}</span>
            {user && <Link className="hover:text-accent hover:underline" href={`/traces?user=${encodeURIComponent(user)}&range=7d`}>{user}</Link>}
            <Mono className="text-ink-3">{traceId}</Mono>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {errors ? <Badge tone="critical" icon>{errors} failed {errors === 1 ? "span" : "spans"}</Badge> : <Badge tone="good" icon>OK</Badge>}
          {session && <Link className="btn btn-sm" href={`/sessions/${encodeURIComponent(session)}`}>Replay session</Link>}
        </div>
      </div>

      <StatStrip
        stats={[
          { label: "Duration", value: duration(end - start) },
          { label: "Spans", value: String(spans.length) },
          { label: "Model calls", value: String(spans.filter((s) => s.span_type === "llm").length) },
          { label: "Tokens", value: compact(spans.reduce((s, x) => s + x.total_tokens, 0)) },
          { label: "Cost", value: usd(spans.reduce((s, x) => s + x.cost, 0)) },
        ]}
      />
      <div className="mt-4"><Waterfall spans={spans} /></div>
    </>
  );
}
