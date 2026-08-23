import { median, percentile } from "@/lib/format";
import type { CompsMatchFlags, ListingRow } from "@/lib/types";

export type ValuationResult = {
  estimate: number | null;
  low: number | null;
  high: number | null;
  medianPerSqm: number | null;
  sample: number;
  confidence: "high" | "medium" | "low";
  widened: boolean;
  comps: ListingRow[];
} & CompsMatchFlags;

export function valueFromComps(
  subjectSqm: number,
  comps: ListingRow[],
  widened: boolean,
  flags: CompsMatchFlags,
): ValuationResult {
  const withSqm = comps.filter((row) => row.price && row.sqm && row.sqm > 10);
  const perSqm = withSqm.map((row) => (row.price as number) / (row.sqm as number));
  const medianPerSqm = median(perSqm);
  const p25 = percentile(perSqm, 0.25);
  const p75 = percentile(perSqm, 0.75);
  const estimate = medianPerSqm ? medianPerSqm * subjectSqm : null;
  const sample = withSqm.length;
  const confidence: ValuationResult["confidence"] =
    sample >= 12 && !widened ? "high" : sample >= 5 ? "medium" : "low";
  return {
    estimate,
    low: p25 ? p25 * subjectSqm : null,
    high: p75 ? p75 * subjectSqm : null,
    medianPerSqm,
    sample,
    confidence,
    widened,
    comps: withSqm.slice(0, 20),
    ...flags,
  };
}
