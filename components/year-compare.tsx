"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { eur, eurDelta, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  askingByType,
  availableCompareYears,
  compareYears,
  defaultCompareYears,
  medianAsking,
  type AnnualIndex,
  type AskingListing,
} from "@/lib/year-compare";

const yearSelectClass =
  "border-input h-8 w-[5.25rem] shrink-0 rounded-lg border bg-transparent px-2 text-sm";

const selectClass =
  "border-input h-8 min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 text-sm sm:max-w-[16rem] sm:flex-none";

export function YearCompare({
  indexByYear,
  declaredByYear,
  listings,
  localities,
}: {
  indexByYear: Record<number, AnnualIndex>;
  declaredByYear: Record<number, number>;
  listings: AskingListing[];
  localities: { id: string; name: string }[];
}) {
  const years = useMemo(() => availableCompareYears(indexByYear), [indexByYear]);
  const defaults = useMemo(() => defaultCompareYears(indexByYear), [indexByYear]);

  const [fromYear, setFromYear] = useState(defaults.from);
  const [toYear, setToYear] = useState(defaults.to);
  const [localityId, setLocalityId] = useState("");
  const [area, setArea] = useState("");

  const selectedLocality = useMemo(
    () => localities.find((row) => row.id === localityId) ?? null,
    [localities, localityId],
  );

  const localityListings = useMemo(() => {
    if (!localityId) return listings;
    return listings.filter((row) => row.localityId === localityId);
  }, [listings, localityId]);

  const areaOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of localityListings) {
      if (!row.area) continue;
      counts.set(row.area, (counts.get(row.area) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "en"));
  }, [localityListings]);

  const scopedListings = useMemo(() => {
    if (!area) return localityListings;
    return localityListings.filter((row) => row.area === area);
  }, [localityListings, area]);

  const typeAsking = useMemo(
    () => askingByType(scopedListings, localityId ? 1 : 5),
    [scopedListings, localityId],
  );

  const place = useMemo(() => {
    if (!selectedLocality) return null;
    const asking = medianAsking(scopedListings);
    if (asking.medianPrice == null) return null;
    const name = area ? `${area} (${selectedLocality.name})` : selectedLocality.name;
    return { name, medianAsking: asking.medianPrice, sample: asking.sample };
  }, [selectedLocality, scopedListings, area]);

  const comparison = useMemo(
    () => compareYears({ fromYear, toYear, indexByYear, declaredByYear, typeAsking, place }),
    [fromYear, toYear, indexByYear, declaredByYear, typeAsking, place],
  );

  if (!years.length) return null;

  const { overall, types } = comparison;
  const emptyLocality = Boolean(localityId) && !scopedListings.length;
  const emptyLabel = area
    ? `${area} (${selectedLocality?.name ?? "this locality"})`
    : (selectedLocality?.name ?? "this locality");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Year to year</CardTitle>
        <CardDescription>
          Typical prices between two years. Pick a locality to use that town's current asking prices, then
          an area when listings name one. The official sold-price index is national — NSO does not publish
          declared values by town or neighbourhood.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-muted-foreground shrink-0">From</span>
              <select
                className={yearSelectClass}
                value={fromYear}
                onChange={(event) => setFromYear(Number(event.target.value))}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-muted-foreground shrink-0">To</span>
              <select
                className={yearSelectClass}
                value={toYear}
                onChange={(event) => setToYear(Number(event.target.value))}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0">Locality</span>
            <select
              className={selectClass}
              value={localityId}
              onChange={(event) => {
                setLocalityId(event.target.value);
                setArea("");
              }}
            >
              <option value="">All Malta</option>
              {localities.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          {localityId && areaOptions.length ? (
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground shrink-0">Area</span>
              <select
                className={selectClass}
                value={area}
                onChange={(event) => setArea(event.target.value)}
              >
                <option value="">All areas</option>
                {areaOptions.map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {emptyLocality ? (
          <p className="text-muted-foreground text-sm">
            No asking prices loaded for {emptyLabel} yet.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <PriceStat label={String(fromYear)} value={eur(overall.from)} />
              <PriceStat label={String(toYear)} value={eur(overall.to)} />
              <PriceStat
                label="Difference"
                value={eurDelta(overall.changeEur)}
                hint={pct(overall.changePct)}
                className={deltaClass(overall.changeEur)}
              />
            </div>
            {overall.hint ? <p className="text-muted-foreground text-xs">{overall.hint}</p> : null}

            {types.length ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">By property type</h3>
                  <p className="text-muted-foreground text-xs">
                    Same official % change for every type. The euro gap is larger on more expensive homes.
                  </p>
                </div>
                <table className="w-full table-fixed text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="text-muted-foreground w-[30%] pb-2 pr-2 font-medium sm:pr-4">Type</th>
                        <th className="text-muted-foreground w-[22%] pb-2 pr-1 font-medium tabular-nums sm:pr-4">{fromYear}</th>
                        <th className="text-muted-foreground w-[22%] pb-2 pr-1 font-medium tabular-nums sm:pr-4">{toYear}</th>
                        <th className="text-muted-foreground w-[26%] pb-2 text-right font-medium">
                          <span className="sm:hidden">Diff</span>
                          <span className="hidden sm:inline">Difference</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {types.map((row) => (
                        <tr key={row.key} className="border-b last:border-0">
                          <td className="py-2 pr-2 sm:py-3 sm:pr-4">
                            <div className="truncate capitalize">{row.label}</div>
                            {row.sample != null ? (
                              <div className="text-muted-foreground text-[10px] sm:text-xs">{row.sample} listings</div>
                            ) : null}
                          </td>
                          <td className="py-2 pr-1 font-medium tabular-nums sm:py-3 sm:pr-4">{eur(row.from)}</td>
                          <td className="py-2 pr-1 font-medium tabular-nums sm:py-3 sm:pr-4">{eur(row.to)}</td>
                          <td className={cn("py-2 text-right font-medium sm:py-3", deltaClass(row.changeEur))}>
                            <div className="text-xs font-semibold tabular-nums sm:text-base">{eurDelta(row.changeEur)}</div>
                            <div className="text-[10px] opacity-80 sm:text-xs">{pct(row.changePct)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </div>
            ) : localityId ? (
              <p className="text-muted-foreground text-sm">
                Not enough listings in {emptyLabel} to split by type yet.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PriceStat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", className)}>{value}</p>
      {hint ? <p className={cn("text-sm", className)}>{hint}</p> : null}
    </div>
  );
}

function deltaClass(value: number | null | undefined) {
  if (value == null || value === 0) return undefined;
  return value > 0 ? "text-emerald-700" : "text-rose-700";
}
