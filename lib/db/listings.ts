import { median, percentile } from "@/lib/format";
import { paginate, uniqueById } from "@/lib/db/paginate";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ListingRow } from "@/lib/types";
import type { AskingListing } from "@/lib/year-compare";

export const LISTING_COLUMNS =
  "id, source, external_id, url, locality_id, street, area, property_type, beds, sqm, ext_sqm, price, title, image_url, finish, has_garage, has_pool, has_lift, first_seen, last_seen, is_active, fingerprint";

const LISTING_SOURCES = ["remax", "propertymarket", "zanzi", "facebook"] as const;
const LISTING_STATS_COLUMNS = "price, sqm, source";
const ASKING_COMPARE_COLUMNS = "locality_id, property_type, price, area";

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

export async function getActiveListingsPage(input: {
  page: number;
  pageSize: number;
  localityId?: string;
  source?: string;
}): Promise<{ listings: ListingRow[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return { listings: [], total: 0, page: input.page, pageSize: input.pageSize, hasMore: false };
  }
  const page = Math.max(1, input.page);
  const pageSize = Math.min(5000, Math.max(1, input.pageSize));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = supabase
    .from("listings")
    .select(LISTING_COLUMNS, { count: "exact" })
    .eq("is_active", true)
    .gt("price", 0)
    .order("last_seen", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (input.localityId) query = query.eq("locality_id", input.localityId);
  if (input.source) query = query.eq("source", input.source);
  const { data, error, count } = await query;
  if (error) throw error;
  const total = count ?? 0;
  return {
    listings: uniqueById((data ?? []) as ListingRow[]),
    total,
    page,
    pageSize,
    hasMore: from + (data?.length ?? 0) < total,
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
