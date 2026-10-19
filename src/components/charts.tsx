"use client";
import { useRouter } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR, formatINRCompact } from "@/domain/money";

export interface Datum { key: string; label: string; value: number }

/** Clickable chart. `href(key)` is the filtered transaction list for that bar. */
export function BarsChart({ data, href, horizontal, height = 220 }: { data: Datum[]; href: (key: string) => string; horizontal?: boolean; height?: number }) {
  const router = useRouter();
  const go = (key: string) => router.push(href(key));
  const common = {
    dataKey: "value" as const, radius: 3, cursor: "pointer", fill: "var(--accent)",
    onClick: (d: unknown) => go((d as { payload: Datum }).payload.key),
  };
  return (
    <div role="img" aria-label="Chart. Select a bar to open matching transactions" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 8 : -8, right: 8, top: 4 }}>
          {horizontal ? (
            <>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={110} tickLine={false} axisLine={false} fontSize={12} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={(v) => formatINRCompact(v)} tickLine={false} axisLine={false} fontSize={11} width={52} />
            </>
          )}
          <Tooltip formatter={(v) => formatINR(Number(v))} cursor={{ fill: "var(--accent-soft)" }} />
          <Bar {...common}>
            {data.map((d) => <Cell key={d.key} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const PALETTE = ["#5b3fd1", "#a89be8", "#14121f", "#d9d3f5", "#7d68de", "#8f8aa8", "#c9c4e4"];

/** Donut of categories. Selecting a slice or legend row opens the filtered list. */
export function DonutChart({ data, total, href }: { data: Datum[]; total: number; href: (key: string) => string }) {
  const router = useRouter();
  const top = data.slice(0, 5);
  const rest = data.slice(5).reduce((s, d) => s + d.value, 0);
  const slices = rest > 0 ? [...top, { key: "", label: "Other", value: rest }] : top;
  const sum = slices.reduce((t, d) => t + d.value, 0);
  const pctOf = (v: number) => (sum > 0 ? Math.round((v / sum) * 100) : 0);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ul className="min-w-32 flex-1 space-y-2 text-sm">
        {slices.map((d, i) => (
          <li key={d.label}>
            <button disabled={!d.key} onClick={() => router.push(href(d.key))} className="flex w-full items-center gap-2 text-left hover:underline disabled:no-underline">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
              <span className="num text-xs text-muted">{pctOf(d.value)}%</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="relative size-36 shrink-0" role="img" aria-label="Category donut chart. Select a slice to open transactions">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius={52} outerRadius={74} paddingAngle={2} cornerRadius={4} stroke="none"
              onClick={(d) => { const k = (d as unknown as { key: string }).key; if (k) router.push(href(k)); }}>
              {slices.map((d, i) => <Cell key={d.label} fill={PALETTE[i % PALETTE.length]} cursor={d.key ? "pointer" : "default"} />)}
            </Pie>
            <Tooltip formatter={(v) => formatINR(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><div className="text-[11px] text-muted">Total spent</div><div className="num text-sm font-semibold">{formatINR(total)}</div></div>
        </div>
      </div>
    </div>
  );
}

/** Area trend with dots; each point opens that month's transactions. */
export function TrendChart({ data, href, height = 230 }: { data: Datum[]; href: (key: string) => string; height?: number }) {
  const router = useRouter();
  return (
    <div role="img" aria-label="Spending trend. Select a point to open that month" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -8, right: 12, top: 8 }}>
          <defs>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#a89be8" strokeWidth="1.5" /></pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickFormatter={(v) => formatINRCompact(v)} tickLine={false} axisLine={false} fontSize={11} width={52} />
          <Tooltip formatter={(v) => formatINR(Number(v))} />
          <Area dataKey="value" stroke="#5b3fd1" strokeWidth={2} fill="url(#hatch)" fillOpacity={0.6}
            dot={{ r: 4, fill: "#5b3fd1", stroke: "#fff", strokeWidth: 2, cursor: "pointer", onClick: (_: unknown, e: unknown) => router.push(href((e as { payload: Datum }).payload.key)) } as never} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
