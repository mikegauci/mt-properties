import { cache } from "react";
import { median, percentile } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  type CompsMatchFlags,
  type Finish,
  type ListingRow,
  type Locality,
  type PriceIndexPoint,
  type ScrapeRun,
  type TransactionRow,
} from "@/lib/types";

const LISTING_COLUMNS =
  "id, source, external_id, url, locality_id, street, area, property_type, beds, sqm, ext_sqm, price, title, image_url, finish, has_garage, has_pool, has_lift, first_seen, last_seen, is_active, fingerprint";

const MIN_COMPS = 5;

const UNUSED_FLAGS: CompsMatchFlags = {
  streetUsed: false,
  finishUsed: false,
  garageUsed: false,
  poolUsed: false,
  liftUsed: false,
  bedsUsed: false,
  extSqmUsed: false,
};

async function paginate<T>(
  fetcher: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; from < 200000; from += page) {
    const { data, error } = await fetcher(from, from + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

async function fetchLocalities(): Promise<Locality[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("localities")
    .select("id, slug, name_en, name_mt, district, island")
    .order("name_en");
  if (error) throw error;
  return (data ?? []) as Locality[];
}

export const getLocalities = cache(fetchLocalities);

export async function getLocality(slug: string): Promise<Locality | null> {
  const supabase = supabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("localities")
    .select("id, slug, name_en, name_mt, district, island")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as Locality | null;
}

export async function getPriceIndex(source = "nso_rppi", series = "overall"): Promise<PriceIndexPoint[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("price_indexes")
    .select("period, index_value, yoy_pct, source, series")
    .eq("source", source)
    .eq("series", series)
    .order("period");
  if (error) throw error;
  return (data ?? []) as PriceIndexPoint[];
}

export async function getNationalTransactions(): Promise<TransactionRow[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("nso_transactions")
    .select("period, period_type, geography_type, district, locality_id, deeds, promise_of_sale, total_value")
    .eq("geography_type", "national")
    .order("period");
  if (error) throw error;
  return (data ?? []) as TransactionRow[];
}

export async function getLocalityTransactions(localityId: string): Promise<TransactionRow[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("nso_transactions")
    .select("period, period_type, geography_type, district, locality_id, deeds, promise_of_sale, total_value")
    .eq("locality_id", localityId)
    .order("period");
  if (error) throw error;
  return (data ?? []) as TransactionRow[];
}

export async function getLocalityDeedTable(): Promise<
  { locality: Locality; deeds: number }[]
> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const [{ data: localities, error: locError }, { data: rows, error: rowError }] = await Promise.all([
    supabase.from("localities").select("id, slug, name_en, name_mt, district, island"),
    supabase
      .from("nso_transactions")
      .select("locality_id, deeds, period")
      .eq("geography_type", "locality")
      .order("period", { ascending: false }),
  ]);
  if (locError) throw locError;
  if (rowError) throw rowError;
  const latestByLocality = new Map<string, number>();
  for (const row of rows ?? []) {
    if (!row.locality_id || latestByLocality.has(row.locality_id)) continue;
    latestByLocality.set(row.locality_id, row.deeds ?? 0);
  }
  return ((localities ?? []) as Locality[])
    .map((locality) => ({ locality, deeds: latestByLocality.get(locality.id) ?? 0 }))
    .sort((a, b) => b.deeds - a.deeds);
}

export async function getActiveListings(filters?: {
  localityId?: string;
  propertyType?: string;
  source?: string;
}): Promise<ListingRow[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const rows = await paginate<ListingRow>((from, to) => {
    let query = supabase
      .from("listings")
      .select(LISTING_COLUMNS)
      .eq("is_active", true)
      .gt("price", 0)
      .order("last_seen", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (filters?.localityId) query = query.eq("locality_id", filters.localityId);
    if (filters?.propertyType) query = query.eq("property_type", filters.propertyType);
    if (filters?.source) query = query.eq("source", filters.source);
    return query;
  });
  return uniqueById(rows);
}

export type AskingStats = {
  sample: number;
  medianPrice: number | null;
  medianPerSqm: number | null;
  p25PerSqm: number | null;
  p75PerSqm: number | null;
};

export function askingStats(listings: ListingRow[]): AskingStats {
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

export async function getPeriodSnapshots(
  localityId: string,
  from: string,
  to: string,
): Promise<{ price: number; sqm: number | null }[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("listing_price_snapshots")
    .select("price, observed_at, listings!inner(locality_id, sqm)")
    .eq("listings.locality_id", localityId)
    .gte("observed_at", from)
    .lt("observed_at", to)
    .limit(5000);
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const listing = row.listings as unknown as { sqm: number | null };
    return { price: Number(row.price), sqm: listing?.sqm ?? null };
  });
}

export async function getLatestScrapeRuns(): Promise<ScrapeRun[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("scrape_runs")
    .select(
      "id, source, started_at, finished_at, listings_upserted, listings_inactivated, error, status",
    )
    .order("started_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as ScrapeRun[];
}

const LISTING_SOURCES = ["remax", "propertymarket", "zanzi"] as const;

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

export function listingCountsFromListings(listings: ListingRow[]) {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    counts.set(listing.source, (counts.get(listing.source) ?? 0) + 1);
  }
  return LISTING_SOURCES.map((source) => ({
    source,
    count: counts.get(source) ?? 0,
  }));
}

export async function getComps(input: {
  localityId: string;
  district: string;
  propertyType: string;
  sqm: number;
  street?: string;
  beds?: number;
  finish?: Finish;
  hasGarage?: boolean;
  hasPool?: boolean;
  hasLift?: boolean;
  extSqm?: number;
}): Promise<{ comps: ListingRow[]; widened: boolean } & CompsMatchFlags> {
  const supabase = supabaseAdmin();
  if (!supabase) return { comps: [], widened: false, ...UNUSED_FLAGS };

  const low = input.sqm * 0.8;
  const high = input.sqm * 1.2;
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("property_type", input.propertyType)
    .eq("locality_id", input.localityId)
    .gt("price", 0)
    .gte("sqm", low)
    .lte("sqm", high)
    .or(`is_active.eq.true,last_seen.gte."${since}"`)
    .limit(200);
  if (error) throw error;

  const locality = refineComps((data ?? []) as ListingRow[], input);
  if (locality.comps.length >= MIN_COMPS) return { ...locality, widened: false };

  const { data: districtLocalities, error: locError } = await supabase
    .from("localities")
    .select("id")
    .eq("district", input.district);
  if (locError) throw locError;
  const ids = (districtLocalities ?? []).map((row) => row.id);
  const { data: wide, error: wideError } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("property_type", input.propertyType)
    .in("locality_id", ids)
    .gt("price", 0)
    .gte("sqm", low)
    .lte("sqm", high)
    .or(`is_active.eq.true,last_seen.gte."${since}"`)
    .limit(200);
  if (wideError) throw wideError;
  const district = refineComps((wide ?? []) as ListingRow[], { ...input, street: undefined });
  return { ...district, widened: true, streetUsed: false };
}

function refineComps(
  rows: ListingRow[],
  input: {
    street?: string;
    beds?: number;
    finish?: Finish;
    hasGarage?: boolean;
    hasPool?: boolean;
    hasLift?: boolean;
    extSqm?: number;
  },
): { comps: ListingRow[] } & CompsMatchFlags {
  let comps = rows;
  const flags: CompsMatchFlags = { ...UNUSED_FLAGS };

  const street = input.street?.trim().toLowerCase();
  if (street) {
    const streetComps = comps.filter(
      (row) => row.street && row.street.toLowerCase().includes(street),
    );
    if (streetComps.length >= MIN_COMPS) {
      comps = streetComps;
      flags.streetUsed = true;
    }
  }

  if (input.extSqm && input.extSqm > 0) {
    const low = input.extSqm * 0.8;
    const high = input.extSqm * 1.2;
    const next = comps.filter(
      (row) => row.ext_sqm != null && row.ext_sqm >= low && row.ext_sqm <= high,
    );
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.extSqmUsed = true;
    }
  }

  if (input.finish) {
    const next = comps.filter((row) => row.finish === input.finish);
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.finishUsed = true;
    }
  }
  if (input.hasGarage) {
    const next = comps.filter((row) => row.has_garage === true);
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.garageUsed = true;
    }
  }
  if (input.hasPool) {
    const next = comps.filter((row) => row.has_pool === true);
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.poolUsed = true;
    }
  }
  if (input.hasLift) {
    const next = comps.filter((row) => row.has_lift === true);
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.liftUsed = true;
    }
  }
  if (input.beds != null) {
    const beds = input.beds;
    const exact = comps.filter((row) => row.beds === beds);
    if (exact.length >= MIN_COMPS) {
      comps = exact;
      flags.bedsUsed = true;
    } else {
      const near = comps.filter((row) => row.beds != null && Math.abs(row.beds - beds) <= 1);
      if (near.length >= MIN_COMPS) {
        comps = near;
        flags.bedsUsed = true;
      }
    }
  }

  return { comps, ...flags };
}
