"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { CircleAlert, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { Span } from "@/lib/queries";
import { lastUserMessage, parseMessages } from "@/lib/messages";
import { compact, duration, usd } from "@/lib/format";
import { SpanDetail } from "./waterfall";
import { spanType } from "./span-bits";

/**
 * Session replay. A session is reduced to its meaningful steps (model calls,
 * tool calls, retrievals) in time order; the player reveals them one at a
 * time while the running cost, tokens, and elapsed time count up.
 */

type Step = { span: Span; turn: number; newTurn: boolean };

const STEP_TYPES = new Set(["llm", "tool", "retrieval", "embedding"]);
const SPEEDS = [1, 2, 4];

export function Replay({ spans }: { spans: Span[] }) {
  const steps = useMemo<Step[]>(() => {
    const ordered = spans.filter((s) => STEP_TYPES.has(s.span_type)).sort((a, b) => a.start - b.start);
    const turns: string[] = [];
    return ordered.map((span) => {
      const known = turns.includes(span.trace_id);
      if (!known) turns.push(span.trace_id);
      return { span, turn: turns.indexOf(span.trace_id) + 1, newTurn: !known };
    });
  }, [spans]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const last = steps.length - 1;
  const current = steps[index];
  const listRef = useRef<HTMLOListElement>(null);

  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(last, next))), [last]);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) { setPlaying(false); return; }
    const timer = setTimeout(() => setIndex((i) => i + 1), 1400 / speed);
    return () => clearTimeout(timer);
  }, [playing, index, last, speed]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-step="${index}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => (index >= last ? p : !p)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, last]);

  if (!steps.length) return <p className="rounded-[10px] border border-line bg-panel p-6 text-ink-2">This session has no model calls, tool calls, or retrievals to replay.</p>;

  const shown = steps.slice(0, index + 1);
  const cost = shown.reduce((s, x) => s + x.span.cost, 0);
  const tokens = shown.reduce((s, x) => s + x.span.total_tokens, 0);
  const elapsed = current.span.start + current.span.duration_ms - steps[0].span.start;
  const totalCost = steps.reduce((s, x) => s + x.span.cost, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Transport */}
      <section className="rounded-[10px] border border-line bg-panel p-4" aria-label="Replay controls">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button className="btn btn-sm !px-2" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous step"><SkipBack size={15} /></button>
            <button className="btn btn-primary btn-sm !w-[92px]" onClick={() => (index >= last ? (setIndex(0), setPlaying(true)) : setPlaying(!playing))}>
              {playing ? <><Pause size={14} />Pause</> : index >= last ? <><Play size={14} />Restart</> : <><Play size={14} />Play</>}
            </button>
            <button className="btn btn-sm !px-2" onClick={() => go(index + 1)} disabled={index === last} aria-label="Next step"><SkipForward size={15} /></button>
          </div>
          <div className="flex rounded-md border border-line-strong p-[2px]" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} aria-pressed={speed === s} className={clsx("num rounded px-2 py-0.5 text-[13px] font-medium", speed === s ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-sunken")}>{s}×</button>
            ))}
          </div>
          <div className="num text-ink-2">Step {index + 1} of {steps.length}</div>
          <dl className="ml-auto flex gap-5">
            {[["Elapsed", duration(elapsed)], ["Tokens so far", compact(tokens)], ["Cost so far", `${usd(cost)} of ${usd(totalCost)}`]].map(([k, v]) => (
              <div key={k}><dt className="text-[12.5px] text-ink-3">{k}</dt><dd className="num font-semibold">{v}</dd></div>
            ))}
          </dl>
        </div>

        {/* Scrubber: one tick per step, grouped by turn. */}
        <div className="mt-4 flex items-end gap-[3px] overflow-x-auto pb-1" role="slider" aria-label="Step" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} tabIndex={0}>
          {steps.map((s, i) => {
            const failed = s.span.status_code === "ERROR";
            return (
              <button
                key={s.span.span_id}
                onClick={() => { setPlaying(false); go(i); }}
                title={`${s.span.name} (${duration(s.span.duration_ms)})`}
                aria-label={`Go to step ${i + 1}: ${s.span.name}`}
                className={clsx("group relative h-[26px] min-w-[10px] flex-1 max-w-[28px]", s.newTurn && i > 0 && "ml-[7px]")}
              >
                <span
                  className={clsx("absolute inset-x-0 bottom-0 rounded-[3px] transition-[height,opacity]", i === index ? "h-[26px]" : "h-[14px] group-hover:h-[20px]", i > index && "opacity-30", failed && "outline outline-2 outline-critical")}
                  style={{ background: spanType(s.span.span_type).color }}
                />
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12.5px] text-ink-3">Use ← and → to step, space to play or pause. Gaps separate turns.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Transcript */}
        <section className="min-w-0 rounded-[10px] border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 font-semibold">Transcript</h2>
          <ol ref={listRef} className="flex max-h-[640px] flex-col gap-3 overflow-y-auto p-4">
            {shown.map((s, i) => (
              <li key={s.span.span_id} data-step={i}>
                {s.newTurn && <div className="mb-2 flex items-center gap-3 text-[12.5px] text-ink-3"><span>Turn {s.turn}</span><span className="h-px flex-1 bg-line" /><Link className="hover:text-accent hover:underline" href={`/traces/${s.span.trace_id}`}>Open trace</Link></div>}
                <StepCard step={s} active={i === index} onSelect={() => { setPlaying(false); go(i); }} />
              </li>
            ))}
          </ol>
        </section>
        <SpanDetail span={current.span} />
      </div>
    </div>
  );
}

function StepCard({ step, active, onSelect }: { step: Step; active: boolean; onSelect: () => void }) {
  const { span } = step;
  const type = spanType(span.span_type);
  const failed = span.status_code === "ERROR";
  const ring = active ? "border-accent ring-2 ring-accent/25" : "border-line";

  if (span.span_type === "llm") {
    const user = lastUserMessage(span.input);
    const answer = parseMessages(span.output).map((m) => m.text).join("\n");
    return (
      <div className="flex flex-col gap-2">
        {user && <div className="ml-auto max-w-[78%] whitespace-pre-wrap break-words rounded-[10px] rounded-br-sm bg-sunken px-3 py-2">{clip(user)}</div>}
        <button onClick={onSelect} className={clsx("max-w-[86%] rounded-[10px] rounded-bl-sm border bg-panel px-3 py-2 text-left", ring)}>
          <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
            <i className="h-2 w-2 rounded-sm" style={{ background: type.color }} />
            <span className="font-medium text-ink-2">{span.model || "model"}</span>
            <span className="num">{duration(span.duration_ms)}</span><span className="num">{compact(span.total_tokens)} tokens</span><span className="num">{usd(span.cost)}</span>
          </div>
          {failed
            ? <div className="flex items-start gap-1.5 text-critical"><CircleAlert size={15} className="mt-[3px] shrink-0" /><span className="break-words">{span.status_message || "The call failed."}</span></div>
            : <div className="whitespace-pre-wrap break-words">{clip(answer) || <span className="text-ink-3">No output captured.</span>}</div>}
        </button>
      </div>
    );
  }

  return (
    <button onClick={onSelect} className={clsx("flex w-full max-w-[86%] items-center gap-2 rounded-md border bg-sunken/50 px-3 py-1.5 text-left", ring)}>
      <i className="h-2 w-2 shrink-0 rounded-sm" style={{ background: type.color }} />
      <span className="text-[12.5px] text-ink-3">{type.label}</span>
      <span className="truncate font-mono text-[12.5px]">{span.tool_name || span.name}</span>
      {failed && <CircleAlert size={14} className="shrink-0 text-critical" aria-label="Failed" />}
      <span className="num ml-auto shrink-0 text-[12.5px] text-ink-3">{duration(span.duration_ms)}</span>
    </button>
  );
}

const clip = (text: string) => (text.length > 900 ? text.slice(0, 900) + "…" : text);
