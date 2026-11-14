import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { RANGES, scopeFrom } from "@/lib/time";
import { recommendations } from "@/lib/optimizer";
import { compact, pct, usd } from "@/lib/format";
import { Empty, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Optimizer" };

export default async function OptimizerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { project } = await requireSession();
  const scope = scopeFrom(project.id, await searchParams);
  const { items, monthlySpend } = await recommendations(scope);
  const total = items.reduce((s, i) => s + i.monthlySavings, 0);

  return (
    <>
      <PageHeader title="Optimizer" description={`Savings found in your own traffic from the last ${RANGES[scope.range].label}, scaled to a 30-day month. Estimates overlap, so the total is an upper bound.`} />

      {items.length === 0 ? (
        <Panel><Empty title="No savings found in this range">The optimizer looks for short calls on large models, repeated prompts, shared prompt openings, failed calls, and oversized context. Try a wider time range for more traffic to analyse.</Empty></Panel>
      ) : (
        <>
          <div className="mb-4 rounded-[10px] border border-line bg-panel px-5 py-4">
            <div className="text-ink-2">Potential saving</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
              <span className="text-[34px] font-bold leading-tight tracking-tight">up to {usd(total, { compact: true })}</span>
              <span className="text-ink-2">per month{monthlySpend > 0 && `, ${pct(Math.min(total / monthlySpend, 1), 0)} of a projected ${usd(monthlySpend, { compact: true })}`}</span>
            </div>
          </div>

          <ol className="flex flex-col gap-4">
            {items.map((r) => (
              <li key={r.id} className="rounded-[10px] border border-line bg-panel">
                <div className="grid gap-x-8 gap-y-3 p-5 lg:grid-cols-[minmax(0,1fr)_200px]">
                  <div>
                    <h2 className="text-[16px] font-semibold">{r.title}</h2>
                    <p className="mt-1 max-w-[70ch] text-ink-2">{r.detail}</p>
                  </div>
                  <div className="lg:text-right">
                    {r.monthlySavings >= 0.01 ? (
                      <>
                        <div className="text-[24px] font-bold leading-tight tracking-tight">{usd(r.monthlySavings, { compact: true })}</div>
                        <div className="text-[13px] text-ink-3">per month, {compact(r.affectedCalls)} calls in range</div>
                      </>
                    ) : (
                      <>
                        <div className="text-[24px] font-bold leading-tight tracking-tight">{compact(r.affectedCalls)} calls</div>
                        <div className="text-[13px] text-ink-3">in range, with no token cost recorded</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto border-t border-line">
                  <table className="data">
                    <tbody>
                      {r.evidence.map((e, i) => (
                        <tr key={i}>
                          <td className="w-[34%] font-medium">{e.href ? <Link href={e.href} className="hover:text-accent hover:underline">{e.label}</Link> : e.label}</td>
                          <td className="num w-[16%] whitespace-nowrap">{e.value}</td>
                          <td className="text-ink-2">{e.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-line px-5 py-2.5 text-[13px] text-ink-3">How this is estimated: {r.assumption}</p>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
