"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { periodLabel } from "@/lib/format";
import type { PriceIndexPoint } from "@/lib/types";

export function PriceIndexChart({ series }: { series: PriceIndexPoint[] }) {
  const data = series.map((row) => ({
    ...row,
    label: periodLabel(row.period, "quarter"),
    index: Number(row.index_value),
  }));

  if (!data.length) {
    return <p className="text-muted-foreground text-sm">No price index loaded yet. Run the NSO ingest.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(value) => [Number(value).toFixed(1), "Index 2015=100"]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.label}
          />
          <Line type="monotone" dataKey="index" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
