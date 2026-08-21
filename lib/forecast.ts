import type { PriceIndexPoint } from "@/lib/types";

export type Forecast = {
  yoyPct: number | null;
  twelveMonth: number | null;
  method: string;
  caveat: string;
};

export function forecastFromIndex(
  currentEstimate: number | null,
  series: PriceIndexPoint[],
): Forecast {
  const latest = [...series].reverse().find((row) => row.yoy_pct != null);
  const yoyPct = latest?.yoy_pct ?? null;
  const twelveMonth =
    currentEstimate != null && yoyPct != null
      ? currentEstimate * (1 + yoyPct / 100)
      : null;
  return {
    yoyPct,
    twelveMonth,
    method:
      yoyPct != null
        ? `Applied latest official house-price index YoY (${latest?.period}) to the comps estimate.`
        : "No official YoY rate is loaded yet.",
    caveat:
      "Indicative only. Locality asking prices can move differently from the national sold-price index, and this is not a surveyor valuation.",
  };
}
