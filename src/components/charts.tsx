"use client";
import { useRouter } from "next/navigation";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
