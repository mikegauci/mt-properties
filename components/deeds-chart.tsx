"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactNumber, eur, periodLabel } from "@/lib/format";
import type { TransactionRow } from "@/lib/types";

export function DeedsChart({ rows }: { rows: TransactionRow[] }) {
  const data = rows.map((row) => ({
    label: periodLabel(row.period, row.period_type),
    deeds: row.deeds ?? 0,
    avg: row.deeds && row.total_value ? row.total_value / row.deeds : null,
  }));

  if (!data.length) {
    return <p className="text-muted-foreground text-sm">No NSO transaction rows yet.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) =>
              name === "deeds"
                ? [compactNumber(Number(value)), "Deeds"]
                : [eur(Number(value)), "Avg declared"]
            }
          />
          <Bar dataKey="deeds" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
