import { median, percentile } from "@/lib/format";
import { paginate, SUPABASE_PAGE_SIZE, uniqueById } from "@/lib/db/paginate";
import {
  filterListings,
  needsClientSideProcessing,
  sortListings,
  type ListingsFilterInput,
  type SortDir,
  type SortKey,
} from "@/lib/listings-filter";
import { toListingPreviews } from "@/lib/listing-preview";
import { supabaseAdmin } from "@/lib/supabase/server";
import { canonicalPropertyType, type ListingRow, type Locality } from "@/lib/types";
import type { AskingListing } from "@/lib/year-compare";

export const LISTING_COLUMNS =
  "id, source, external_id, url, locality_id, street, area, property_type, beds, sqm, ext_sqm, price, title, image_url, finish, has_garage, has_pool, has_lift, first_seen, last_seen, is_active, fingerprint";

const LISTING_SOURCES = ["remax", "propertymarket", "zanzi", "facebook"] as const;
const LISTING_STATS_COLUMNS = "price, sqm, source";
const ASKING_COMPARE_COLUMNS = "locality_id, property_type, price, area";
const FACET_COLUMNS = "locality_id, property_type, source";

const SQL_SORT_COLUMNS: Partial<Record<SortKey, string>> = {
  title: "title",
  beds: "beds",
  price: "price",
  sqm: "sqm",
  source: "source",
  last_seen: "last_seen",
  first_seen: "first_seen",
  price_per_sqm: "price_per_sqm",
};

export type ListingsPageInput = ListingsFilterInput & {
  page: number;
  pageSize: number;
};

export type ListingFacets = {
  sourceCounts: { source: string; count: number }[];
  localityCounts: Record<string, number>;
  propertyTypes: { type: string; count: number }[];
};

function applyDbFilters(query: any, input: ListingsFilterInput) {
  let next = query;
  if (input.source && input.source !== "all") next = next.eq("source", input.source);
  if (input.localityId) next = next.eq("locality_id", input.localityId);
  if (input.priceMin != null) next = next.gte("price", input.priceMin);
  if (input.priceMax != null) next = next.lte("price", input.priceMax);
  const tokens = (input.q ?? "").trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const pattern = `%${token.replace(/[%_]/g, "")}%`;
    next = next.or(`title.ilike.${pattern},street.ilike.${pattern},area.ilike.${pattern}`);
  }
  return next;
}

function applySqlSort(query: any, sortKey: SortKey = "last_seen", sortDir: SortDir = "desc") {
  const column = SQL_SORT_COLUMNS[sortKey] ?? "last_seen";
  const ascending = sortDir === "asc";
  return query.order(column, { ascending, nullsFirst: false }).order("id", { ascending });
}

export type AskingStats = {
  sample: number;
  medianPrice: number | null;
  medianPerSqm: number | null;
  p25PerSqm: number | null;
  p75PerSqm: number | null;
};

export type SnapshotPoint = { price: number; sqm: number | null };

export type PeriodCompareSnapshots = {
  current: SnapshotPoint[];
  previous: SnapshotPoint[];
};

function listingQuery(filters?: { localityId?: string; propertyType?: string; source?: string }) {
  const supabase = supabaseAdmin();
  if (!supabase) return null;
  let query = supabase
    .from("listings")
    .select(LISTING_COLUMNS, { count: "exact" })
    .eq("is_active", true)
    .gt("price", 0)
    .order("last_seen", { ascending: false })
    .order("id", { ascending: false });
  if (filters?.localityId) query = query.eq("locality_id", filters.localityId);
  if (filters?.propertyType) query = query.eq("property_type", filters.propertyType);
  if (filters?.source) query = query.eq("source", filters.source);
  return query;
}

export async function getActiveListings(filters?: {
  localityId?: string;
  propertyType?: string;
  source?: string;
}): Promise<ListingRow[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const rows = await paginate<ListingRow>((from, to) => {
    const query = listingQuery(filters);
    if (!query) return Promise.resolve({ data: [], error: null });
    return query.range(from, to);
  });
  return uniqueById(rows);
}

export async function getActiveListingsPage(
  input: ListingsPageInput,
  localities: Locality[] = [],
): Promise<{ listings: ListingRow[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
  const supabase = supabaseAdmin();
  const page = Math.max(1, input.page);
  const pageSize = Math.min(SUPABASE_PAGE_SIZE, Math.max(1, input.pageSize));
  if (!supabase) {
    return { listings: [], total: 0, page, pageSize, hasMore: false };
  }

  const sortKey = input.sortKey ?? "last_seen";
  const sortDir = input.sortDir ?? "desc";

  if (needsClientSideProcessing(input)) {
    const rows = await paginate<ListingRow>((from, to) => {
      let query = supabase
        .from("listings")
        .select(LISTING_COLUMNS)
        .eq("is_active", true)
        .gt("price", 0)
        .order("last_seen", { ascending: false })
        .order("id", { ascending: false });
      query = applyDbFilters(query, input);
      return query.range(from, to);
    });
    const previews = toListingPreviews(uniqueById(rows), localities);
    const filtered = filterListings(previews, input, localities);
    const sorted = sortListings(filtered, sortKey, sortDir);
    const total = sorted.length;
    const from = (page - 1) * pageSize;
    const listings = sorted.slice(from, from + pageSize);
    return {
      listings,
      total,
      page,
      pageSize,
      hasMore: from + listings.length < total,
    };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = supabase
    .from("listings")
    .select(LISTING_COLUMNS, { count: "exact" })
    .eq("is_active", true)
    .gt("price", 0);
  query = applyDbFilters(query, input);
  query = applySqlSort(query, sortKey, sortDir);
  query = query.range(from, to);
  const { data, error, count } = await query;
  if (error) {
    if (error.code === "PGRST103") {
      return { listings: [], total: count ?? from, page, pageSize, hasMore: false };
    }
    throw error;
  }
  const total = count ?? 0;
  const batchSize = data?.length ?? 0;
  return {
    listings: uniqueById((data ?? []) as ListingRow[]),
    total,
    page,
    pageSize,
    hasMore: batchSize > 0 && from + batchSize < total,
  };
}

export async function getListingFacets(source?: string): Promise<ListingFacets> {
  const supabase = supabaseAdmin();
  if (!supabase) return { sourceCounts: [], localityCounts: {}, propertyTypes: [] };

  type FacetRow = { locality_id: string | null; property_type: string | null; source: string };
  const rows = await paginate<FacetRow>((from, to) => {
    let query = supabase
      .from("listings")
      .select(FACET_COLUMNS)
      .eq("is_active", true)
      .gt("price", 0)
      .order("id", { ascending: true });
    if (source && source !== "all") query = query.eq("source", source);
    return query.range(from, to);
  });

  const localityCounts: Record<string, number> = {};
  const sourceCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.locality_id) {
      localityCounts[row.locality_id] = (localityCounts[row.locality_id] ?? 0) + 1;
    }
    sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);
    const canonical = canonicalPropertyType(row.property_type);
    if (canonical) typeCounts.set(canonical, (typeCounts.get(canonical) ?? 0) + 1);
  }

  return {
    sourceCounts: [...sourceCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([sourceName, count]) => ({ source: sourceName, count })),
    localityCounts,
    propertyTypes: [...typeCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([type, count]) => ({ type, count })),
  };
}

export function askingStats(listings: Pick<ListingRow, "price" | "sqm">[]): AskingStats {
  const priced = listings.filter((row) => row.price && row.price > 0);
  const withSqm = priced.filter((row) => row.sqm && row.sqm > 10);
  const perSqm = withSqm.map((row) => (row.price as number) / (row.sqm as number));
  return {
    sample: priced.length,
    medianPrice: median(priced.map((row) => row.price as number)),
    medianPerSqm: median(perSqm),
    p25PerSqm: percentile(perSqm, 0.25),
    p75PerSqm: percentile(perSqm, 0.75),
  };
}

export function snapshotStats(rows: SnapshotPoint[]): AskingStats {
  return askingStats(
    rows
      .filter((row) => row.price > 0)
      .map((row) => ({ price: row.price, sqm: row.sqm })),
  );
}

export async function getPeriodSnapshots(
  localityId: string,
  from: string,
  to: string,
): Promise<SnapshotPoint[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("listing_price_snapshots")
    .select("price, observed_at, listings!inner(locality_id, sqm)")
    .eq("listings.locality_id", localityId)
    .gte("observed_at", from)
    .lt("observed_at", to)
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const listing = row.listings as unknown as { sqm: number | null };
    return { price: Number(row.price), sqm: listing?.sqm ?? null };
  });
}

export async function getPeriodCompareSnapshots(
  localityId: string,
  days: number,
): Promise<PeriodCompareSnapshots> {
  const now = Date.now();
  const currentFrom = new Date(now - days * 86400000).toISOString();
  const previousFrom = new Date(now - days * 2 * 86400000).toISOString();
  const [current, previous] = await Promise.all([
    getPeriodSnapshots(localityId, currentFrom, new Date(now).toISOString()),
    getPeriodSnapshots(localityId, previousFrom, currentFrom),
  ]);
  return { current, previous };
}

export async function getListingCounts() {
  const supabase = supabaseAdmin();
  if (!supabase) return [] as { source: string; count: number }[];
  return Promise.all(
    LISTING_SOURCES.map(async (source) => {
      const { count, error } = await supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("source", source);
      if (error) throw error;
      return { source, count: count ?? 0 };
    }),
  );
}

export function listingCountsFromListings(listings: Pick<ListingRow, "source">[]) {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    counts.set(listing.source, (counts.get(listing.source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([source, count]) => ({ source, count }));
}

export async function getActiveListingStats(): Promise<{
  stats: AskingStats;
  counts: { source: string; count: number }[];
}> {
  const empty: AskingStats = {
    sample: 0,
    medianPrice: null,
    medianPerSqm: null,
    p25PerSqm: null,
    p75PerSqm: null,
  };
  const supabase = supabaseAdmin();
  if (!supabase) return { stats: empty, counts: [] };
  type StatsRow = { price: number | null; sqm: number | null; source: string };
  const rows = await paginate<StatsRow>((from, to) =>
    supabase
      .from("listings")
      .select(LISTING_STATS_COLUMNS)
      .eq("is_active", true)
      .gt("price", 0)
      .order("last_seen", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  return {
    stats: askingStats(rows),
    counts: listingCountsFromListings(rows),
  };
}

export async function getAskingListingsForCompare(): Promise<AskingListing[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  type Row = { locality_id: string | null; property_type: string | null; price: number | null; area: string | null };
  const rows = await paginate<Row>((from, to) =>
    supabase
      .from("listings")
      .select(ASKING_COMPARE_COLUMNS)
      .eq("is_active", true)
      .gt("price", 0)
      .order("last_seen", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  return rows.map((row) => ({
    localityId: row.locality_id,
    propertyType: row.property_type,
    price: row.price,
    area: row.area,
  }));
}
