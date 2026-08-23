import { cacheLife, cacheTag } from "next/cache";
import * as data from "@/lib/data";

export async function getCachedLocalities() {
  "use cache";
  cacheTag("reference-data");
  cacheLife("reference");
  return data.getLocalities();
}

export async function getCachedLocality(slug: string) {
  "use cache";
  cacheTag("reference-data");
  cacheLife("reference");
  return data.getLocality(slug);
}

export async function getCachedPriceIndex(source = "nso_rppi", series = "overall") {
  "use cache";
  cacheTag("reference-data");
  cacheLife("reference");
  return data.getPriceIndex(source, series);
}

export async function getCachedNationalTransactions() {
  "use cache";
  cacheTag("reference-data");
  cacheLife("reference");
  return data.getNationalTransactions();
}

export async function getCachedLocalityDeedTable() {
  "use cache";
  cacheTag("reference-data");
  cacheLife("reference");
  return data.getLocalityDeedTable();
}

export async function getCachedActiveListings(filters?: {
  localityId?: string;
  propertyType?: string;
  source?: string;
}) {
  "use cache";
  cacheTag("listings");
  cacheLife("listings");
  return data.getActiveListings(filters);
}

export async function getCachedLocalityTransactions(localityId: string) {
  "use cache";
  cacheTag("reference-data");
  cacheLife("reference");
  return data.getLocalityTransactions(localityId);
}

export async function getCachedPeriodSnapshots(localityId: string, days: number) {
  "use cache";
  cacheTag("listings");
  cacheLife("listings");
  const now = Date.now();
  const currentFrom = new Date(now - days * 86400000).toISOString();
  const previousFrom = new Date(now - days * 2 * 86400000).toISOString();
  return data.getPeriodSnapshots(localityId, previousFrom, currentFrom);
}

export async function getCachedLatestScrapeRuns() {
  "use cache";
  cacheTag("scrape-runs");
  cacheLife("scrapeRuns");
  return data.getLatestScrapeRuns();
}

export async function getCachedListingCounts() {
  "use cache";
  cacheTag("listings");
  cacheLife("listings");
  return data.getListingCounts();
}

export async function getCachedActiveListingStats() {
  "use cache";
  cacheTag("listings");
  cacheLife("listings");
  return data.getActiveListingStats();
}
