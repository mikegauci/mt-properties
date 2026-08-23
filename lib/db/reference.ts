import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Locality, PriceIndexPoint, ScrapeRun, TransactionRow } from "@/lib/types";

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

export async function getLocalityDeedTable(): Promise<{ locality: Locality; deeds: number }[]> {
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
