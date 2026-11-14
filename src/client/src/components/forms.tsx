"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { ActionState } from "@/app/(app)/actions";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-critical">{state.error}</p>;
  if (state.message) return <p role="status" className="rounded-md bg-good-soft px-3 py-2 text-good-ink">{state.message}</p>;
  return null;
}

/** Wraps a server action form with pending state and inline feedback. */
export function ActionForm({ action, submit, children, className, inline }: { action: Action; submit: string; children?: React.ReactNode; className?: string; inline?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-3"}>
      {children}
      {inline ? (
        <span className="inline-flex items-center gap-2">
          <button className="btn btn-sm" disabled={pending}>{pending ? "Working…" : submit}</button>
          {state.error && <span role="alert" className="text-[13px] text-critical">{state.error}</span>}
          {state.message && <span role="status" className="text-[13px] text-good-ink">{state.message}</span>}
        </span>
      ) : (
        <>
          <Feedback state={state} />
          <div><button className="btn btn-primary" disabled={pending}>{pending ? "Working…" : submit}</button></div>
        </>
      )}
    </form>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-[13px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn btn-sm" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
      {copied ? <><Check size={13} />Copied</> : <><Copy size={13} />{label}</>}
    </button>
  );
}

export function CreateKeyForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5"><span className="font-medium">Key name</span><input className="field" name="name" placeholder="production backend" required /></label>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create key"}</button>
      </form>
      {state.error && <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-critical">{state.error}</p>}
      {state.key && (
        <div role="status" className="rounded-md border border-line-strong bg-sunken px-3 py-2.5">
          <div className="font-semibold">Copy this key now. It is not shown again.</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2"><code className="break-all font-mono text-[12.5px]">{state.key}</code><CopyButton text={state.key} /></div>
        </div>
      )}
    </div>
  );
}

/** Budget form: the value field only appears when the budget is scoped to something. */
export function BudgetForm({ action }: { action: Action }) {
  const [scope, setScope] = useState("all");
  return (
    <ActionForm action={action} submit="Create budget">
      <Field label="Name"><input className="field" name="name" placeholder="Production monthly" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (USD)"><input className="field" name="amount" type="number" min="0.01" step="0.01" placeholder="500" required /></Field>
        <Field label="Period">
          <select className="field" name="period" defaultValue="monthly"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
        </Field>
      </div>
      <Field label="Applies to">
        <select className="field" name="scope_type" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All spend</option><option value="model">One model</option><option value="service">One service</option><option value="user">One user</option><option value="environment">One environment</option>
        </select>
      </Field>
      {scope !== "all" && <Field label={`Which ${scope}`} hint="Exact name as it appears in traces."><input className="field" name="scope_value" required /></Field>}
      <Field label="Warn at (% of budget)"><input className="field" name="threshold_pct" type="number" min="1" max="100" defaultValue={80} /></Field>
    </ActionForm>
  );
}
