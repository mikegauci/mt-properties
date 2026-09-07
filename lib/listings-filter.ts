import { listingMatchesArea } from "@/lib/areas";
import { displayTypeLabel } from "@/lib/format";
import { localityRegion, REGION_LABELS } from "@/lib/regions";
import { canonicalPropertyType, type Locality } from "@/lib/types";

export type SortKey =
  | "title"
  | "locality"
  | "type"
  | "beds"
  | "price"
  | "price_per_sqm"
  | "sqm"
  | "source"
  | "last_seen"
  | "first_seen";

export type SortDir = "asc" | "desc";

export type ListingFilterRow = {
  id: string;
  source: string;
  locality_id: string | null;
  localityName: string | null;
  area: string | null;
  property_type: string | null;
  beds: number | null;
  sqm: number | null;
  price: number | null;
  title: string | null;
  street: string | null;
  first_seen: string;
  last_seen: string;
};

export type ListingsFilterInput = {
  source?: string;
  localityId?: string;
  propertyType?: string;
  excludeTypes?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  q?: string;
  area?: string;
  sortKey?: SortKey;
  sortDir?: SortDir;
};

function normalizeSearchToken(token: string) {
  return token.replace(/[€,\s]/g, "").toLowerCase();
}

function priceSearchText(price: number | null | undefined) {
  if (!price || price <= 0) return "";
  const parts = [String(price)];
  const formatted = new Intl.NumberFormat("en-MT", { maximumFractionDigits: 0 }).format(price);
  parts.push(formatted.replace(/,/g, ""));
  if (price >= 1000) {
    const thousands = price / 1000;
    parts.push(Number.isInteger(thousands) ? `${thousands}k` : `${thousands.toFixed(1).replace(/\.0$/, "")}k`);
  }
  if (price >= 1_000_000) {
    const millions = price / 1_000_000;
    parts.push(Number.isInteger(millions) ? `${millions}m` : `${millions.toFixed(1).replace(/\.0$/, "")}m`);
  }
  return parts.join(" ");
}

function listingHaystack(row: ListingFilterRow, localityById: Map<string, Locality>) {
  const locality = row.locality_id ? localityById.get(row.locality_id) : undefined;
  const region = locality ? localityRegion(locality) : null;
  return [
    row.localityName,
    row.area,
    region,
    region ? REGION_LABELS[region] : null,
    canonicalPropertyType(row.property_type),
    displayTypeLabel(row.property_type),
    priceSearchText(row.price),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortValue(row: ListingFilterRow, key: SortKey): string | number | null {
  switch (key) {
    case "title":
      return row.title?.trim() || row.street || null;
    case "locality":
      return row.localityName;
    case "type":
      return canonicalPropertyType(row.property_type);
    case "beds":
      return row.beds;
    case "price":
      return row.price;
    case "price_per_sqm":
      return row.price != null && row.sqm != null && row.sqm > 0 ? row.price / row.sqm : null;
    case "sqm":
      return row.sqm;
    case "source":
      return row.source;
    case "last_seen":
      return row.last_seen;
    case "first_seen":
      return row.first_seen;
  }
}

export function compareListings(
  left: ListingFilterRow,
  right: ListingFilterRow,
  key: SortKey,
  dir: SortDir,
) {
  const a = sortValue(left, key);
  const b = sortValue(right, key);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  let result = 0;
  if (typeof a === "number" && typeof b === "number") result = a - b;
  else result = String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

export function filterListings<T extends ListingFilterRow>(
  listings: T[],
  input: ListingsFilterInput,
  localities: Locality[],
): T[] {
  const localityById = new Map(localities.map((row) => [row.id, row]));
  const tokens = (input.q ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeSearchToken);
  const excludePropertyTypeSet = new Set(input.excludeTypes ?? []);
  const propertyType = input.propertyType && input.propertyType !== "all" ? input.propertyType : null;
  const source = input.source && input.source !== "all" ? input.source : null;

  return listings.filter((row) => {
    if (source && row.source !== source) return false;
    if (input.localityId && row.locality_id !== input.localityId) return false;
    if (input.area && !listingMatchesArea(row, input.area)) return false;
    if (propertyType && canonicalPropertyType(row.property_type) !== propertyType) return false;
    const canonical = canonicalPropertyType(row.property_type);
    if (canonical && excludePropertyTypeSet.has(canonical)) return false;
    if (input.priceMin != null && (row.price == null || row.price < input.priceMin)) return false;
    if (input.priceMax != null && (row.price == null || row.price > input.priceMax)) return false;
    if (tokens.length && !tokens.every((token) => listingHaystack(row, localityById).includes(token))) {
      return false;
    }
    return true;
  });
}

export function sortListings<T extends ListingFilterRow>(
  listings: T[],
  sortKey: SortKey = "last_seen",
  sortDir: SortDir = "desc",
): T[] {
  const rows = [...listings];
  rows.sort((left, right) => compareListings(left, right, sortKey, sortDir));
  return rows;
}

export function needsClientSideProcessing(input: ListingsFilterInput): boolean {
  return Boolean(input.q?.trim()) || input.sortKey === "locality";
}

export function parseSortParam(value: string | null | undefined): { sortKey: SortKey; sortDir: SortDir } {
  const fallback = { sortKey: "last_seen" as SortKey, sortDir: "desc" as SortDir };
  if (!value) return fallback;
  const [rawKey, rawDir] = value.split(":");
  const validKeys: SortKey[] = [
    "title",
    "locality",
    "type",
    "beds",
    "price",
    "price_per_sqm",
    "sqm",
    "source",
    "last_seen",
    "first_seen",
  ];
  if (!validKeys.includes(rawKey as SortKey)) return fallback;
  return {
    sortKey: rawKey as SortKey,
    sortDir: rawDir === "asc" ? "asc" : "desc",
  };
}

export function parsePriceParam(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/[€,\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
