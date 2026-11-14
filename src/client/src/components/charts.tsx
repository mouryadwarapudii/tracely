"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact, duration, pct, tick, usd } from "@/lib/format";

export type Unit = "usd" | "count" | "ms" | "pct";

const fmt: Record<Unit, (v: number) => string> = {
  usd: (v) => usd(v),
  count: (v) => compact(v),
  ms: (v) => duration(v),
  pct: (v) => pct(v, 1),
};
const axisFmt: Record<Unit, (v: number) => string> = {
  usd: (v) => (v >= 100 ? "$" + compact(v) : v >= 1 ? "$" + v.toFixed(0) : "$" + v.toFixed(2)),
  count: (v) => compact(v),
  ms: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "s" : Math.round(v) + "ms"),
  pct: (v) => (v > 0 && v < 0.1 ? (v * 100).toFixed(1) : Math.round(v * 100)) + "%",
};

const AXIS = { fontSize: 12, fill: "var(--ink-3)" };
const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
export const seriesColor = (name: string, index: number) => (name === "Other" ? "var(--s-other)" : SERIES[index % SERIES.length]);

type TipProps = { active?: boolean; label?: number; payload?: { name: string; value: number; color: string; dataKey: string }[]; unit: Unit; bucket: number; names?: Record<string, string>; total?: boolean };

function Tip({ active, label, payload, unit, bucket, names, total }: TipProps) {
  if (!active || !payload?.length || label === undefined) return null;
  const rows = [...payload].reverse();
  return (
    <div className="rounded-md border border-line-strong bg-panel px-3 py-2 text-[13px] shadow-lg">
      <div className="mb-1 text-ink-3">{tick(label, bucket)} UTC</div>
      {rows.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />{names?.[p.dataKey] || p.name}</span>
          <span className="num font-semibold">{fmt[unit](p.value)}</span>
        </div>
      ))}
      {total && rows.length > 1 && (
        <div className="mt-1 flex justify-between gap-6 border-t border-line pt-1"><span>Total</span><span className="num font-semibold">{fmt[unit](rows.reduce((s, p) => s + p.value, 0))}</span></div>
      )}
    </div>
  );
}

function axes(unit: Unit, bucket: number) {
  return (
    <>
      <CartesianGrid stroke="var(--grid)" vertical={false} />
      <XAxis dataKey="t" tickFormatter={(t) => tick(t, bucket)} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} minTickGap={48} />
      <YAxis tickFormatter={axisFmt[unit]} tick={AXIS} tickLine={false} axisLine={false} width={48} />
    </>
  );
}

/** One measure over time. `kind` follows the measure: bars for counts and sums per bucket, a line for rates and percentiles. */
export function Trend({ data, dataKey, name, unit, bucket, kind = "bar", color = "var(--s1)", height = 220 }: {
  data: Record<string, number>[]; dataKey: string; name: string; unit: Unit; bucket: number; kind?: "bar" | "line" | "area"; color?: string; height?: number;
}) {
  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: 0 } };
  const tip = <Tooltip content={<Tip unit={unit} bucket={bucket} />} cursor={{ stroke: "var(--line-strong)", fill: "var(--sunken)", fillOpacity: 0.6 }} isAnimationActive={false} />;
  return (
    <div style={{ height }} role="img" aria-label={`${name} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart {...common} barCategoryGap="18%">
            {axes(unit, bucket)}{tip}
            <Bar dataKey={dataKey} name={name} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={28} />
          </BarChart>
        ) : kind === "area" ? (
          <AreaChart {...common}>
            {axes(unit, bucket)}{tip}
            <Area dataKey={dataKey} name={name} type="monotone" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} isAnimationActive={false} />
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {axes(unit, bucket)}{tip}
            <Line dataKey={dataKey} name={name} type="monotone" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--panel)", strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Spend per bucket, stacked by model. Colour follows the model's rank in the legend, which is always shown. */
export function StackedSpend({ points, models, bucket, height = 260 }: { points: Record<string, number>[]; models: string[]; bucket: number; height?: number }) {
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
        {models.map((m, i) => (
          <li key={m} className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: seriesColor(m, i) }} />{m}</li>
        ))}
      </ul>
      <div style={{ height }} role="img" aria-label="Spend over time by model">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
            {axes("usd", bucket)}
            <Tooltip content={<Tip unit="usd" bucket={bucket} total />} cursor={{ fill: "var(--sunken)", fillOpacity: 0.6 }} isAnimationActive={false} />
            {models.map((m, i) => (
              <Bar key={m} dataKey={m} name={m} stackId="spend" fill={seriesColor(m, i)} stroke="var(--panel)" strokeWidth={1} isAnimationActive={false} maxBarSize={28}
                radius={i === models.length - 1 ? [3, 3, 0, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** A metric by hour with the flagged hours marked. The marker is a ringed dot, so it does not rely on colour alone. */
export function FlaggedLine({ points, dataKey, name, unit, height = 150 }: {
  points: { t: number; value: number; flagged: boolean }[]; dataKey?: string; name: string; unit: Unit; height?: number;
}) {
  void dataKey;
  return (
    <div style={{ height }} role="img" aria-label={`${name} by hour with unusual hours marked`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {axes(unit, 6 * 3600)}
          <Tooltip content={<Tip unit={unit} bucket={3600} />} cursor={{ stroke: "var(--line-strong)" }} isAnimationActive={false} />
          <Line
            dataKey="value" name={name} type="monotone" stroke="var(--s1)" strokeWidth={2} isAnimationActive={false}
            activeDot={{ r: 4, stroke: "var(--panel)", strokeWidth: 2 }}
            dot={(p: { cx?: number; cy?: number; index?: number; payload?: { flagged: boolean } }) =>
              p.payload?.flagged && p.cx !== undefined && p.cy !== undefined ? (
                <g key={p.index}>
                  <circle cx={p.cx} cy={p.cy} r={7} fill="none" stroke="var(--critical)" strokeWidth={1.5} />
                  <circle cx={p.cx} cy={p.cy} r={3.5} fill="var(--critical)" stroke="var(--panel)" strokeWidth={1.5} />
                </g>
              ) : (
                <g key={p.index} />
              )
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
