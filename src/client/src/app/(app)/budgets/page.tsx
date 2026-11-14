import Link from "next/link";
import clsx from "clsx";
import { requireSession } from "@/lib/auth";
import { budgetStatuses, type BudgetStatus } from "@/lib/budgets";
import { listChannels } from "@/lib/db";
import { usd } from "@/lib/format";
import { Badge, Empty, PageHeader, Panel } from "@/components/ui";
import { BudgetForm } from "@/components/forms";
import { createBudgetAction, deleteBudgetAction } from "../actions";

export const metadata = { title: "Budgets" };

const STATE: Record<BudgetStatus["state"], { tone: "good" | "warning" | "critical"; label: string }> = {
  ok: { tone: "good", label: "On track" },
  warning: { tone: "warning", label: "Near limit" },
  forecast: { tone: "warning", label: "Will exceed" },
  exceeded: { tone: "critical", label: "Exceeded" },
};

const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

export default async function BudgetsPage() {
  const { project } = await requireSession();
  const budgets = await budgetStatuses(project.id);
  const channels = listChannels(project.id);

  return (
    <>
      <PageHeader title="Budgets" description="Set a spending limit for everything, or for one model, service, user, or environment. Tracely alerts you at the warning level, when the limit is passed, and when the current rate would pass it." />
      {channels.length === 0 && budgets.length > 0 && (
        <p className="mb-4 rounded-md bg-warn-soft px-3 py-2 text-warn-ink">Budget alerts are recorded but not sent anywhere yet. <Link href="/alerts" className="font-semibold underline">Add a Slack or webhook channel</Link>.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel flush>
          {budgets.length === 0 ? (
            <Empty title="No budgets yet">Create one to track spend against a limit. Periods follow the UTC calendar: days, weeks from Monday, and months.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {budgets.map((b) => {
                const used = Math.min(b.spent / b.amount, 1);
                const projected = Math.min(b.forecast / b.amount, 1);
                const s = STATE[b.state];
                return (
                  <li key={b.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{b.name}</h3>
                      <Badge tone={s.tone} icon>{s.label}</Badge>
                      <span className="text-[13px] text-ink-3">{b.scope_type === "all" ? "All spend" : `${b.scope_type}: ${b.scope_value}`}, {b.period}, {b.period === "daily" ? day(b.periodStart) : `${day(b.periodStart)} to ${day(b.periodEnd - 1)}`}</span>
                      <form action={deleteBudgetAction} className="ml-auto"><input type="hidden" name="id" value={b.id} /><button className="btn btn-quiet btn-sm">Delete</button></form>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-3">
                      <span><span className="num text-[20px] font-bold tracking-tight">{usd(b.spent)}</span><span className="num text-ink-2"> of {usd(b.amount)}</span></span>
                      <span className="num text-[13px] text-ink-2">Forecast {usd(b.forecast)} by period end</span>
                    </div>
                    {/* Solid = spent so far, hatched = forecast, tick = warning level. */}
                    <div className="relative mt-2 h-[10px] overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${Math.round(used * 100)}% of budget used`}>
                      <div className="absolute inset-y-0 left-0 rounded-full opacity-40" style={{ width: `${projected * 100}%`, background: `repeating-linear-gradient(135deg, var(--ink-3) 0 3px, transparent 3px 6px)` }} />
                      <div className={clsx("absolute inset-y-0 left-0 rounded-full", b.state === "exceeded" ? "bg-critical" : "bg-[var(--s1)]")} style={{ width: `${used * 100}%` }} />
                      <div className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: `${b.threshold_pct}%` }} title={`Warning at ${b.threshold_pct}%`} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="New budget"><BudgetForm action={createBudgetAction} /></Panel>
      </div>
    </>
  );
}
