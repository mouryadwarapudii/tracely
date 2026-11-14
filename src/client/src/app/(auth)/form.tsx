"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

export function AuthForm({ action, fields, submit }: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: { name: string; label: string; type: string; autoComplete: string; hint?: string }[];
  submit: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1.5">
          <span className="font-medium">{f.label}</span>
          <input className="field" name={f.name} type={f.type} autoComplete={f.autoComplete} required />
          {f.hint && <span className="text-[13px] text-ink-3">{f.hint}</span>}
        </label>
      ))}
      {state.error && <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-critical">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Working…" : submit}</button>
    </form>
  );
}
