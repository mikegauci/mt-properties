"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { compactNumber } from "@/lib/format";
import { localityRegion, REGION_LABELS, REGIONS, type Region } from "@/lib/regions";
import type { Locality } from "@/lib/types";
import { cn } from "@/lib/utils";

type Row = { locality: Locality; deeds: number };

const REGION_CHIP: Record<Region | "all", string> = {
  all: "bg-primary text-primary-foreground",
  north: "bg-sky-100 text-sky-900",
  south: "bg-amber-100 text-amber-950",
  central: "bg-violet-100 text-violet-900",
  gozo: "bg-emerald-100 text-emerald-900",
};

const REGION_CHIP_IDLE =
  "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground";

export function LocalitiesTable({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<Region | "all">("all");

  const totalDeeds = useMemo(() => rows.reduce((sum, row) => sum + row.deeds, 0), [rows]);

  const filtered = useMemo(() => {
    if (region === "all") return rows;
    return rows.filter(({ locality }) => localityRegion(locality) === region);
  }, [rows, region]);

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, row) => sum + row.deeds, 0),
    [filtered],
  );
  const maxDeeds = filtered[0]?.deeds || 1;

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center gap-4 px-4 py-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <div className="min-w-0 flex-1">
          <div className="font-heading text-base font-medium">Contracts signed</div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            NSO deeds in the last 12 months. {open ? "Hide town list" : "Show town list"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-sky-800">
            {compactNumber(totalDeeds)}
          </div>
          <p className="text-muted-foreground text-xs">contracts</p>
        </div>
        <ChevronDown
          className={cn("text-muted-foreground size-5 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <CardContent className="space-y-4 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FilterChip active={region === "all"} tone="all" onClick={() => setRegion("all")}>
              All · {compactNumber(totalDeeds)}
            </FilterChip>
            {REGIONS.map((value) => {
              const count = rows
                .filter(({ locality }) => localityRegion(locality) === value)
                .reduce((sum, row) => sum + row.deeds, 0);
              return (
                <FilterChip
                  key={value}
                  active={region === value}
                  tone={value}
                  onClick={() => setRegion(value)}
                >
                  {REGION_LABELS[value]} · {compactNumber(count)}
                </FilterChip>
              );
            })}
          </div>

          {region !== "all" ? (
            <p className="text-muted-foreground text-xs">
              {compactNumber(filteredTotal)} contracts in {REGION_LABELS[region]}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="text-muted-foreground pb-2 pr-4 font-medium">Locality</th>
                  <th className="text-muted-foreground pb-2 pr-4 font-medium">District</th>
                  <th className="text-muted-foreground pb-2 font-medium text-right">Deeds</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ locality, deeds }) => (
                  <tr key={locality.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4">
                      <Link className="hover:text-sky-800 hover:underline" href={`/localities/${locality.slug}`}>
                        {locality.name_en}
                      </Link>
                      <div className="text-muted-foreground text-xs">{locality.name_mt}</div>
                    </td>
                    <td className="text-muted-foreground py-2.5 pr-4">{locality.district}</td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-3">
                        <div className="bg-sky-100 h-1.5 w-24 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full bg-sky-600"
                            style={{ width: `${Math.max(6, (deeds / maxDeeds) * 100)}%` }}
                          />
                        </div>
                        <span className="w-14 text-right font-medium tabular-nums">{compactNumber(deeds)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function FilterChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: Region | "all";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        active ? REGION_CHIP[tone] : REGION_CHIP_IDLE,
      )}
    >
      {children}
    </button>
  );
}
