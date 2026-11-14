import clsx from "clsx";
import { parseMessages } from "@/lib/messages";

export const SPAN_TYPES: Record<string, { label: string; color: string }> = {
  llm: { label: "Model call", color: "var(--s1)" },
  tool: { label: "Tool", color: "var(--s2)" },
  retrieval: { label: "Retrieval", color: "var(--s3)" },
  embedding: { label: "Embedding", color: "var(--s4)" },
  agent: { label: "Agent", color: "var(--s7)" },
  span: { label: "Other", color: "var(--s-other)" },
};
export const spanType = (t: string) => SPAN_TYPES[t] || SPAN_TYPES.span;

export function TypeLegend({ types }: { types: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
      {Object.keys(SPAN_TYPES).filter((t) => types.includes(t)).map((t) => (
        <li key={t} className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SPAN_TYPES[t].color }} />{SPAN_TYPES[t].label}</li>
      ))}
    </ul>
  );
}

const ROLE_LABEL: Record<string, string> = { system: "System", user: "User", assistant: "Assistant", tool: "Tool" };

export function Messages({ raw, emptyText = "Not captured." }: { raw: string; emptyText?: string }) {
  const messages = parseMessages(raw);
  if (!messages.length) return <p className="text-ink-3">{emptyText}</p>;
  return (
    <div className="flex flex-col gap-2">
      {messages.map((m, i) => (
        <div key={i} className={clsx("rounded-md border border-line px-3 py-2", m.role === "assistant" ? "bg-accent-soft/50" : "bg-sunken/60")}>
          {m.role && <div className="mb-0.5 text-[12.5px] font-semibold text-ink-2">{ROLE_LABEL[m.role] || m.role}</div>}
          <Collapsible text={m.text} />
        </div>
      ))}
    </div>
  );
}

function Collapsible({ text }: { text: string }) {
  if (text.length <= 700) return <div className="whitespace-pre-wrap break-words">{text}</div>;
  return (
    <details>
      <summary className="cursor-pointer list-none">
        <span className="whitespace-pre-wrap break-words">{text.slice(0, 500)}…</span>
        <span className="ml-1 text-[13px] font-medium text-accent">Show all {text.length.toLocaleString("en-US")} characters</span>
      </summary>
      <div className="mt-2 whitespace-pre-wrap break-words border-t border-line pt-2">{text}</div>
    </details>
  );
}
