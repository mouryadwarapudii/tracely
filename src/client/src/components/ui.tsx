import Link from "next/link";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-[68ch] text-ink-2">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Panel({ title, hint, action, children, className, flush }: {
  title?: string; hint?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean;
}) {
  return (
    <section className={clsx("rounded-[10px] border border-line bg-panel", className)}>
      {title && (
        <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5">
          <div>
            <h2 className="font-semibold">{title}</h2>
            {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/**
 * Headline figures as one ledger strip rather than separate cards: the
 * numbers are read together, so they sit together.
 */
export function StatStrip({ stats }: { stats: { label: string; value: string; delta?: number | null; goodWhen?: "up" | "down"; note?: string }[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line bg-panel sm:grid-cols-3 lg:grid-cols-none lg:auto-cols-fr lg:grid-flow-col">
      {stats.map((s) => (
        <div key={s.label} className="border-b border-r border-line px-4 py-3.5 lg:border-b-0 lg:last:border-r-0">
          <div className="text-[13px] text-ink-2">{s.label}</div>
          <div className="mt-0.5 text-[24px] font-bold leading-tight tracking-tight">{s.value}</div>
          <div className="mt-0.5 min-h-[18px] text-[12.5px] leading-snug text-ink-3">
            {s.delta !== undefined && s.delta !== null ? <Delta value={s.delta} goodWhen={s.goodWhen} /> : s.note}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Delta({ value, goodWhen }: { value: number; goodWhen?: "up" | "down" }) {
  if (!Number.isFinite(value)) return <span>new this period</span>;
  if (Math.abs(value) < 0.005) return <span>no change vs previous period</span>;
  const up = value > 0;
  const good = goodWhen ? (goodWhen === "up") === up : null;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span>
      <span className={clsx("inline-flex items-center font-medium", good === true && "text-good-ink", good === false && "text-critical")}>
        <Icon size={13} />{Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%
      </span>{" "}
      vs previous period
    </span>
  );
}

const TONES = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good-ink",
  warning: "bg-warn-soft text-warn-ink",
  critical: "bg-critical-soft text-critical",
};

export function Badge({ tone = "neutral", children, icon }: { tone?: keyof typeof TONES; children: React.ReactNode; icon?: boolean }) {
  const Icon = tone === "good" ? CircleCheck : tone === "warning" ? TriangleAlert : tone === "critical" ? CircleAlert : null;
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[1px] text-[12.5px] font-medium", TONES[tone])}>
      {icon && Icon && <Icon size={12} />}{children}
    </span>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={clsx("font-mono text-[12.5px]", className)}>{children}</span>;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-10 sm:px-8">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      {children && <div className="max-w-[60ch] text-ink-2">{children}</div>}
      {action}
    </div>
  );
}

export function Pager({ page, more, hrefFor }: { page: number; more: boolean; hrefFor: (page: number) => string }) {
  if (page === 0 && !more) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[13px] text-ink-3">
      <span>Page {page + 1}</span>
      <div className="flex gap-2">
        {page > 0 ? <Link className="btn btn-sm" href={hrefFor(page - 1)}>Previous</Link> : <span className="btn btn-sm opacity-40">Previous</span>}
        {more ? <Link className="btn btn-sm" href={hrefFor(page + 1)}>Next</Link> : <span className="btn btn-sm opacity-40">Next</span>}
      </div>
    </div>
  );
}

/** Horizontal ranked bars for a breakdown. One hue: the bars encode magnitude, the labels carry identity. */
export function BarList({ rows, format }: { rows: { key: string; value: number; note?: string; href?: string }[]; format: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!rows.length) return <p className="text-ink-3">No data in this range.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const label = <span className="truncate font-medium" title={r.key}>{r.key}</span>;
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3">
              {r.href ? <Link href={r.href} className="min-w-0 truncate hover:text-accent hover:underline">{label}</Link> : label}
              <span className="num shrink-0">{format(r.value)}{r.note && <span className="ml-2 text-ink-3">{r.note}</span>}</span>
            </div>
            <div className="mt-1 h-[6px] rounded-full bg-sunken">
              <div className="h-full rounded-full bg-[var(--s1)]" style={{ width: `${max > 0 ? Math.max((r.value / max) * 100, 1) : 0}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
