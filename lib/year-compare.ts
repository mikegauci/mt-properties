import { median } from "@/lib/format";
import {
  canonicalPropertyType,
  PROPERTY_TYPES,
  type PriceIndexPoint,
  type PropertyType,
  type TransactionRow,
  type TypeAsking,
} from "@/lib/types";

export type AnnualIndex = { avg: number; q4: number | null };

export type AskingListing = {
  localityId: string | null;
  propertyType: string | null;
  price: number | null;
  area: string | null;
};

export type YearComparePlace = {
  name: string;
  medianAsking: number;
  sample: number;
};

export type YearCompareInput = {
  fromYear: number;
  toYear: number;
  indexByYear: Record<number, AnnualIndex>;
  declaredByYear: Record<number, number>;
  typeAsking: TypeAsking[];
  place?: YearComparePlace | null;
};

export type ComparedPrice = {
  key: string;
  label: string;
  from: number | null;
  to: number | null;
  changeEur: number | null;
  changePct: number | null;
  hint?: string;
  sample?: number;
};

export function buildAnnualIndex(index: PriceIndexPoint[]): Record<number, AnnualIndex> {
  const quarters = new Map<number, number[]>();
  const q4 = new Map<number, number>();

  for (const row of index) {
    const date = new Date(`${row.period}T00:00:00Z`);
    const year = date.getUTCFullYear();
    const value = Number(row.index_value);
    const bucket = quarters.get(year) ?? [];
    bucket.push(value);
    quarters.set(year, bucket);
    if (date.getUTCMonth() === 9) q4.set(year, value);
  }

  const out: Record<number, AnnualIndex> = {};
  for (const [year, values] of quarters) {
    out[year] = {
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
      q4: q4.get(year) ?? null,
    };
  }
  return out;
}

export function buildDeclaredByYear(national: TransactionRow[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const row of national) {
    if (row.period_type !== "year" || row.geography_type !== "national") continue;
    if (!row.deeds || !row.total_value) continue;
    const year = new Date(`${row.period}T00:00:00Z`).getUTCFullYear();
    out[year] = Number(row.total_value) / row.deeds;
  }
  return out;
}

export function availableCompareYears(indexByYear: Record<number, AnnualIndex>): number[] {
  return Object.keys(indexByYear)
    .map(Number)
    .sort((a, b) => a - b);
}

export function defaultCompareYears(indexByYear: Record<number, AnnualIndex>): {
  from: number;
  to: number;
} {
  const years = availableCompareYears(indexByYear);
  const currentYear = new Date().getFullYear();
  const to = years.includes(currentYear) ? currentYear : (years.at(-1) ?? currentYear);
  const from = years.includes(2023) ? 2023 : (years.find((year) => year < to) ?? years[0] ?? 2023);
  return { from, to };
}

export function askingByType(listings: AskingListing[], minSample = 5): TypeAsking[] {
  const prices = new Map<PropertyType, number[]>();
  for (const row of listings) {
    if (!row.price || row.price <= 0) continue;
    const type = canonicalPropertyType(row.propertyType);
    if (!type) continue;
    const bucket = prices.get(type) ?? [];
    bucket.push(row.price);
    prices.set(type, bucket);
  }

  return PROPERTY_TYPES.flatMap((type) => {
    const values = prices.get(type) ?? [];
    const medianPrice = median(values);
    if (values.length < minSample || medianPrice == null) return [];
    return [{ type, medianPrice, sample: values.length }];
  });
}

export function medianAsking(listings: AskingListing[]): { medianPrice: number | null; sample: number } {
  const prices = listings.map((row) => row.price).filter((price): price is number => price != null && price > 0);
  return { medianPrice: median(prices), sample: prices.length };
}

export function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

function scaleByIndex(
  amount: number | null | undefined,
  fromIndex: number | null | undefined,
  toIndex: number | null | undefined,
): number | null {
  if (amount == null || fromIndex == null || toIndex == null || fromIndex === 0) return null;
  return amount * (toIndex / fromIndex);
}

function anchorDeclared(
  indexByYear: Record<number, AnnualIndex>,
  declaredByYear: Record<number, number>,
): { year: number; value: number } | null {
  const years = Object.keys(declaredByYear)
    .map(Number)
    .filter((year) => indexByYear[year]?.avg != null)
    .sort((a, b) => a - b);
  const year = years.at(-1);
  if (year == null) return null;
  return { year, value: declaredByYear[year] };
}

function soldPriceForYear(
  year: number,
  indexByYear: Record<number, AnnualIndex>,
  declaredByYear: Record<number, number>,
): { value: number | null; actual: boolean } {
  const actual = declaredByYear[year];
  if (actual != null) return { value: actual, actual: true };
  const anchor = anchorDeclared(indexByYear, declaredByYear);
  if (!anchor) return { value: null, actual: false };
  return {
    value: scaleByIndex(anchor.value, indexByYear[anchor.year]?.avg, indexByYear[year]?.avg),
    actual: false,
  };
}

function comparedPrice(input: {
  key: string;
  label: string;
  from: number | null;
  to: number | null;
  hint?: string;
  sample?: number;
}): ComparedPrice {
  const changeEur = input.from != null && input.to != null ? input.to - input.from : null;
  return {
    ...input,
    changeEur,
    changePct: pctChange(input.from, input.to),
  };
}

export function compareYears(input: YearCompareInput): {
  overall: ComparedPrice;
  types: ComparedPrice[];
} {
  const nowYear =
    availableCompareYears(input.indexByYear)
      .slice()
      .reverse()
      .find((year) => input.indexByYear[year]?.avg != null) ?? input.toYear;

  const place = input.place;
  const fromSold = soldPriceForYear(input.fromYear, input.indexByYear, input.declaredByYear);
  const toSold = soldPriceForYear(input.toYear, input.indexByYear, input.declaredByYear);
  const anchor = anchorDeclared(input.indexByYear, input.declaredByYear);
  const bothActual = fromSold.actual && toSold.actual;
  const overall = place
    ? comparedPrice({
        key: "overall",
        label: `Typical asking in ${place.name}`,
        from: scaleByIndex(
          place.medianAsking,
          input.indexByYear[nowYear]?.avg,
          input.indexByYear[input.fromYear]?.avg,
        ),
        to: scaleByIndex(place.medianAsking, input.indexByYear[nowYear]?.avg, input.indexByYear[input.toYear]?.avg),
        hint: `Median of ${place.sample} current listings in ${place.name}, moved with the official national sold-price index. NSO does not publish declared values by town or neighbourhood.`,
        sample: place.sample,
      })
    : comparedPrice({
        key: "overall",
        label: "Typical sold price",
        from: fromSold.value,
        to: toSold.value,
        hint: bothActual
          ? "NSO total declared value ÷ deed count. Mix of every property type."
          : anchor
            ? `Estimated from the official house-price index and the ${anchor.year} NSO average declared price.`
            : "Official house-price index. Load NSO declared totals to show euro amounts.",
      });

  return {
    overall,
    types: input.typeAsking.map((row) =>
      comparedPrice({
        key: row.type,
        label: row.type.replaceAll("_", " "),
        from: scaleByIndex(row.medianPrice, input.indexByYear[nowYear]?.avg, input.indexByYear[input.fromYear]?.avg),
        to: scaleByIndex(row.medianPrice, input.indexByYear[nowYear]?.avg, input.indexByYear[input.toYear]?.avg),
        hint: `${row.sample} current listings. Today's median asking, moved with the official sold-price index.`,
        sample: row.sample,
      }),
    ),
  };
}
