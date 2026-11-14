"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { CircleAlert } from "lucide-react";
import type { Span } from "@/lib/queries";
import { compact, duration, usd } from "@/lib/format";
import { Messages, TypeLegend, spanType } from "./span-bits";
import { Mono } from "./ui";

type Node = Span & { depth: number };

/** Orders spans as a tree (parents before children, siblings by start time) and records depth. */
function flatten(spans: Span[]): Node[] {
  const ids = new Set(spans.map((s) => s.span_id));
  const children = new Map<string, Span[]>();
  for (const s of spans) {
    const parent = ids.has(s.parent_span_id) ? s.parent_span_id : "";
    children.set(parent, [...(children.get(parent) || []), s]);
  }
  const out: Node[] = [];
  const walk = (parent: string, depth: number) => {
    for (const s of (children.get(parent) || []).sort((a, b) => a.start - b.start)) {
      out.push({ ...s, depth });
      walk(s.span_id, depth + 1);
    }
  };
  walk("", 0);
  return out;
}

export function Waterfall({ spans }: { spans: Span[] }) {
  const nodes = useMemo(() => flatten(spans), [spans]);
  const t0 = Math.min(...nodes.map((s) => s.start));
  const t1 = Math.max(...nodes.map((s) => s.start + s.duration_ms));
  const total = Math.max(t1 - t0, 1);
  const firstInteresting = nodes.find((s) => s.status_code === "ERROR") || nodes.find((s) => s.span_type === "llm") || nodes[0];
  const [selectedId, setSelectedId] = useState(firstInteresting?.span_id);
  const selected = nodes.find((s) => s.span_id === selectedId) || nodes[0];
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 rounded-[10px] border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-semibold">Timeline</h2>
          <TypeLegend types={[...new Set(nodes.map((s) => (s.span_type in { llm: 1, tool: 1, retrieval: 1, embedding: 1, agent: 1 } ? s.span_type : "span")))]} />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[minmax(200px,34%)_1fr] border-b border-line text-[12px] text-ink-3">
              <div className="px-4 py-1.5">Span</div>
              <div className="relative mr-[76px] h-[26px]">
                {ticks.map((f) => (
                  <span key={f} className={clsx("absolute top-1.5 whitespace-nowrap", f === 0 ? "" : f === 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${f * 100}%` }}>{duration(total * f)}</span>
                ))}
              </div>
            </div>
            <ul role="listbox" aria-label="Spans">
              {nodes.map((s) => {
                const type = spanType(s.span_type);
                const left = ((s.start - t0) / total) * 100;
                const width = Math.max((s.duration_ms / total) * 100, 0.4);
                const active = s.span_id === selected?.span_id;
                const failed = s.status_code === "ERROR";
                return (
                  <li key={s.span_id}>
                    <button
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelectedId(s.span_id)}
                      className={clsx("grid w-full grid-cols-[minmax(200px,34%)_1fr] items-center border-b border-line text-left last:border-b-0", active ? "bg-accent-soft" : "hover:bg-sunken/60")}
                    >
                      <span className="flex min-w-0 items-center gap-2 py-[7px] pr-2" style={{ paddingLeft: 16 + s.depth * 14 }}>
                        <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: type.color }} />
                        <span className="truncate font-mono text-[12.5px]" title={s.name}>{s.name}</span>
                        {failed && <CircleAlert size={14} className="shrink-0 text-critical" aria-label="Failed" />}
                      </span>
                      <span className="relative mr-[76px] block h-[30px]">
                        {ticks.slice(1, -1).map((f) => <span key={f} className="absolute inset-y-0 w-px bg-line" style={{ left: `${f * 100}%` }} />)}
                        <span
                          className={clsx("absolute top-[10px] h-[10px] rounded-[3px]", failed && "outline outline-2 outline-offset-1 outline-critical")}
                          style={{ left: `${left}%`, width: `${width}%`, minWidth: 3, background: type.color }}
                        />
                        <span className="num absolute top-[6px] whitespace-nowrap pl-1.5 text-[12px] text-ink-3" style={{ left: `calc(${Math.min(left + width, 100)}%)` }}>{duration(s.duration_ms)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {selected && <SpanDetail span={selected} />}
    </div>
  );
}

export function SpanDetail({ span }: { span: Span }) {
  const type = spanType(span.span_type);
  const attributes = Object.entries(span.attributes || {}).sort(([a], [b]) => a.localeCompare(b));
  const isModel = span.span_type === "llm" || span.span_type === "embedding";
  const facts: [string, string][] = [
    ["Duration", duration(span.duration_ms)],
    ...(isModel ? ([["Model", span.model || "Unknown"], ["Provider", span.provider || "Unknown"], ["Input tokens", compact(span.input_tokens)], ["Output tokens", compact(span.output_tokens)], ["Cost", usd(span.cost)]] as [string, string][]) : []),
    ...(span.tool_name ? ([["Tool", span.tool_name]] as [string, string][]) : []),
    ["Service", span.service_name],
  ];
  return (
    <aside className="min-w-0 self-start rounded-[10px] border border-line bg-panel lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] text-ink-2"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: type.color }} />{type.label}</div>
        <h2 className="mt-0.5 break-words font-mono text-[13.5px] font-medium">{span.name}</h2>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {span.status_code === "ERROR" && (
          <div role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-critical">
            <div className="font-semibold">This span failed</div>
            <div className="break-words">{span.status_message || "No error message was recorded."}</div>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {facts.map(([k, v]) => (
            <div key={k}><dt className="text-[12.5px] text-ink-3">{k}</dt><dd className="num break-words font-medium">{v}</dd></div>
          ))}
        </dl>
        {(span.input || span.output || isModel) && (
          <>
            <div><h3 className="mb-1.5 font-semibold">Input</h3><Messages raw={span.input} emptyText="No input was captured for this span." /></div>
            <div><h3 className="mb-1.5 font-semibold">Output</h3><Messages raw={span.output} emptyText="No output was captured for this span." /></div>
          </>
        )}
        {attributes.length > 0 && (
          <details>
            <summary className="cursor-pointer font-semibold">Attributes ({attributes.length})</summary>
            <dl className="mt-2 flex flex-col gap-1.5">
              {attributes.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[minmax(0,45%)_1fr] gap-2">
                  <dt className="truncate font-mono text-[12px] text-ink-3" title={k}>{k}</dt>
                  <dd className="break-all font-mono text-[12px]">{v}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        <div className="text-[12.5px] text-ink-3">Span ID <Mono>{span.span_id}</Mono></div>
      </div>
    </aside>
  );
}
