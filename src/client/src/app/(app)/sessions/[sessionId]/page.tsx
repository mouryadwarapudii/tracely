import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { sessionSpans } from "@/lib/queries";
import { dateTime, duration, usd } from "@/lib/format";
import { Empty, Mono, Panel } from "@/components/ui";
import { Replay } from "@/components/replay";

export const metadata = { title: "Session replay" };

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { project } = await requireSession();
  const sessionId = decodeURIComponent((await params).sessionId);
  const spans = await sessionSpans(project.id, sessionId);
  if (!spans.length) {
    return <Panel><Empty title="Session not found" action={<Link className="btn" href="/sessions">Back to sessions</Link>}>No spans carry this session ID. It may be older than the retention period.</Empty></Panel>;
  }
  const start = Math.min(...spans.map((s) => s.start));
  const end = Math.max(...spans.map((s) => s.start + s.duration_ms));
  const user = spans.find((s) => s.user_id)?.user_id;
  const turns = new Set(spans.map((s) => s.trace_id)).size;

  return (
    <>
      <Link href="/sessions" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-accent"><ChevronLeft size={15} />Sessions</Link>
      <div className="mb-4">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">Session replay</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
          <Mono>{sessionId}</Mono>
          <span>{dateTime(start)}</span>
          <span>{spans[0].service_name}</span>
          {user && <span>{user}</span>}
          <span>{turns} {turns === 1 ? "turn" : "turns"} over {duration(end - start)}</span>
          <span>{usd(spans.reduce((s, x) => s + x.cost, 0))} total</span>
        </div>
      </div>
      <Replay spans={spans} />
    </>
  );
}
