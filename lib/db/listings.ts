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
import { propertyTypeOrFilter } from "@/lib/property-type-sql";
import { supabaseAdmin } from "@/lib/supabase/server";
import { canonicalPropertyType, type ListingRow, type Locality } from "@/lib/types";
import type { AskingListing } from "@/lib/year-compare";

export const LISTING_COLUMNS =
  "id, source, external_id, url, locality_id, street, area, property_type, beds, sqm, ext_sqm, price, title, image_url, finish, has_garage, has_pool, has_lift, first_seen, last_seen, is_active, fingerprint, property_id, match_block";

const DEDUPED_LISTINGS = "listings_deduped";

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
  type: "property_type",
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

function isMissingRpc(error: { code?: string } | null) {
  return error?.code === "PGRST202";
}

async function siblingSourcesByPropertyId(propertyIds: string[]): Promise<Map<string, string[]>> {
  const uniqueIds = [...new Set(propertyIds.filter(Boolean))];
  const result = new Map<string, string[]>();
  if (!uniqueIds.length) return result;

  const supabase = supabaseAdmin();
  if (!supabase) return result;

  const { data, error } = await supabase.rpc("listing_sibling_sources", {
    p_property_ids: uniqueIds,
  });
  if (isMissingRpc(error)) return result;
  if (error) throw error;

  for (const row of data ?? []) {
    if (!row.property_id) continue;
    result.set(row.property_id, (row.sources ?? []).map(String));
  }
  return result;
}

async function attachSiblingSources(listings: ListingRow[]): Promise<ListingRow[]> {
  const propertyIds = listings.map((row) => row.property_id).filter(Boolean) as string[];
  const siblings = await siblingSourcesByPropertyId(propertyIds);
  if (!siblings.size) return listings;
  return listings.map((listing) => {
    if (!listing.property_id) return listing;
    const sources = siblings.get(listing.property_id);
    if (!sources?.length) return listing;
    return { ...listing, sibling_sources: sources };
  });
}

function escapeFilterValue(value: string) {
  return value.replace(/[%_]/g, "");
}

function applyDbFilters(query: any, input: ListingsFilterInput) {
  let next = query;
  if (input.source && input.source !== "all") next = next.eq("source", input.source);
  if (input.localityId) next = next.eq("locality_id", input.localityId);
  if (input.priceMin != null) next = next.gte("price", input.priceMin);
  if (input.priceMax != null) next = next.lte("price", input.priceMax);
  if (input.propertyType && input.propertyType !== "all") {
    next = next.or(propertyTypeOrFilter(input.propertyType));
  }
  if (input.area) {
    const pattern = `%${escapeFilterValue(input.area)}%`;
    next = next.or(`area.ilike.${pattern},title.ilike.${pattern},street.ilike.${pattern}`);
  }
  const tokens = (input.q ?? "").trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const pattern = `%${escapeFilterValue(token)}%`;
    next = next.or(`title.ilike.${pattern},street.ilike.${pattern},area.ilike.${pattern}`);
  }
  return next;
}

function applySqlSort(query: any, sortKey: SortKey = "last_seen", sortDir: SortDir = "desc") {
  const ascending = sortDir === "asc";
  if (sortKey === "locality") {
    return query
      .order("name_en", { ascending, foreignTable: "localities", nullsFirst: false })
      .order("id", { ascending });
  }
  const column = SQL_SORT_COLUMNS[sortKey] ?? "last_seen";
  return query.order(column, { ascending, nullsFirst: false }).order("id", { ascending });
}

function listingsSelectQuery(sortKey: SortKey) {
  if (sortKey === "locality") return `${LISTING_COLUMNS},localities(name_en)`;
  return LISTING_COLUMNS;
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
        .from(DEDUPED_LISTINGS)
        .select(LISTING_COLUMNS)
        .eq("is_active", true)
        .gt("price", 0)
        .order("last_seen", { ascending: false })
        .order("id", { ascending: false });
      query = applyDbFilters(query, input);
      return query.range(from, to);
    });
    const enriched = await attachSiblingSources(uniqueById(rows));
    const previews = toListingPreviews(enriched, localities);
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
  let query: any = supabase
    .from(DEDUPED_LISTINGS)
    .select(LISTING_COLUMNS, { count: "exact" });
  query = query.eq("is_active", true).gt("price", 0);
  if (sortKey === "locality") {
    query = query.not("locality_id", "is", null);
  }
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
  const rows = await attachSiblingSources(uniqueById((data ?? []) as unknown as ListingRow[]));
  return {
    listings: rows,
    total,
    page,
    pageSize,
    hasMore: batchSize > 0 && from + batchSize < total,
  };
}

export async function getListingFacets(source?: string): Promise<ListingFacets> {
  const supabase = supabaseAdmin();
  if (!supabase) return { sourceCounts: [], localityCounts: {}, propertyTypes: [] };

  const sourceFilter = source && source !== "all" ? source : null;
  const [sourceResult, localityResult, typeResult] = await Promise.all([
    supabase.rpc("listing_source_facets", { p_source: sourceFilter }),
    supabase.rpc("listing_locality_facets", { p_source: sourceFilter }),
    supabase.rpc("listing_property_type_facets", { p_source: sourceFilter }),
  ]);

  if (
    isMissingRpc(sourceResult.error) ||
    isMissingRpc(localityResult.error) ||
    isMissingRpc(typeResult.error)
  ) {
    return getListingFacetsFallback(source);
  }
  if (sourceResult.error) throw sourceResult.error;
  if (localityResult.error) throw localityResult.error;
  if (typeResult.error) throw typeResult.error;

  const localityCounts: Record<string, number> = {};
  for (const row of localityResult.data ?? []) {
    if (row.locality_id) {
      localityCounts[row.locality_id] = Number(row.count);
    }
  }

  const typeCounts = new Map<string, number>();
  for (const row of typeResult.data ?? []) {
    const canonical = canonicalPropertyType(row.property_type);
    if (!canonical) continue;
    typeCounts.set(canonical, (typeCounts.get(canonical) ?? 0) + Number(row.count));
  }

  return {
    sourceCounts: (sourceResult.data ?? []).map((row: { source: string; count: number }) => ({
      source: row.source,
      count: Number(row.count),
    })),
    localityCounts,
    propertyTypes: [...typeCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([type, count]) => ({ type, count })),
  };
}

async function getListingFacetsFallback(source?: string): Promise<ListingFacets> {
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

export async function getAreaCounts(
  localityId: string,
  source: string | undefined,
  catalogAreas: string[],
): Promise<{ area: string; count: number }[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];

  const sourceFilter = source && source !== "all" ? source : null;
  const { data, error } = await supabase.rpc("listing_area_counts", {
    p_locality_id: localityId,
    p_source: sourceFilter,
  });
  if (isMissingRpc(error)) {
    return getAreaCountsFallback(localityId, source, catalogAreas);
  }
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const name of catalogAreas) {
    counts.set(name, 0);
  }
  for (const row of data ?? []) {
    if (row.area) counts.set(row.area, Number(row.count));
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([area, count]) => ({ area, count }))
    .sort((left, right) => left.area.localeCompare(right.area, "en"));
}

async function getAreaCountsFallback(
  localityId: string,
  source: string | undefined,
  catalogAreas: string[],
): Promise<{ area: string; count: number }[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];

  type AreaRow = { area: string | null };
  const rows = await paginate<AreaRow>((from, to) => {
    let query = supabase
      .from("listings")
      .select("area")
      .eq("is_active", true)
      .gt("price", 0)
      .eq("locality_id", localityId)
      .not("area", "is", null)
      .order("id", { ascending: true });
    if (source && source !== "all") query = query.eq("source", source);
    return query.range(from, to);
  });

  const counts = new Map<string, number>();
  for (const name of catalogAreas) {
    counts.set(name, 0);
  }
  for (const row of rows) {
    const area = row.area?.trim();
    if (!area) continue;
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([area, count]) => ({ area, count }))
    .sort((left, right) => left.area.localeCompare(right.area, "en"));
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

  const [statsResult, countsResult] = await Promise.all([
    supabase.rpc("listing_asking_stats"),
    supabase.rpc("listing_source_counts_agg"),
  ]);
  if (isMissingRpc(statsResult.error) || isMissingRpc(countsResult.error)) {
    return getActiveListingStatsFallback();
  }
  if (statsResult.error) throw statsResult.error;
  if (countsResult.error) throw countsResult.error;

  const row = statsResult.data?.[0];
  const stats: AskingStats = row
    ? {
        sample: Number(row.sample ?? 0),
        medianPrice: row.median_price != null ? Number(row.median_price) : null,
        medianPerSqm: row.median_per_sqm != null ? Number(row.median_per_sqm) : null,
        p25PerSqm: row.p25_per_sqm != null ? Number(row.p25_per_sqm) : null,
        p75PerSqm: row.p75_per_sqm != null ? Number(row.p75_per_sqm) : null,
      }
    : empty;

  const counts = (countsResult.data ?? []).map((entry: { source: string; count: number }) => ({
    source: entry.source,
    count: Number(entry.count),
  }));

  return { stats, counts };
}

async function getActiveListingStatsFallback(): Promise<{
  stats: AskingStats;
  counts: { source: string; count: number }[];
}> {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return {
      stats: { sample: 0, medianPrice: null, medianPerSqm: null, p25PerSqm: null, p75PerSqm: null },
      counts: [],
    };
  }
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
  const { data, error } = await supabase.rpc("listing_asking_compare_rows");
  if (isMissingRpc(error)) {
    return getAskingListingsForCompareFallback();
  }
  if (error) throw error;
  return (data ?? []).map(
    (row: { locality_id: string | null; property_type: string | null; price: number | null; area: string | null }) => ({
      localityId: row.locality_id,
      propertyType: row.property_type,
      price: row.price,
      area: row.area,
    }),
  );
}

async function getAskingListingsForCompareFallback(): Promise<AskingListing[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  type Row = {
    locality_id: string | null;
    property_type: string | null;
    price: number | null;
    area: string | null;
  };
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
