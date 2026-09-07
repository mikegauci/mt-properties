import { cacheLife, cacheTag } from "next/cache";
import * as data from "@/lib/data";
import type { ListingsPageInput } from "@/lib/db/listings";

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

export async function getCachedPeriodCompare(localityId: string, days: number) {
  "use cache";
  cacheTag("listings");
  cacheLife("listings");
  return data.getPeriodCompareSnapshots(localityId, days);
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

export async function getCachedAskingListingsForCompare() {
  "use cache";
  cacheTag("listings");
  cacheLife("listings");
  return data.getAskingListingsForCompare();
}

export async function getCachedListingsPage(input: ListingsPageInput) {
  "use cache";
  cacheTag("listings");
  cacheLife("listings");
  const localities = await data.getLocalities();
  return data.getActiveListingsPage(input, localities);
}

export async function getCachedListingFacets(source?: string) {
  "use cache";
  cacheTag("listings");
  cacheLife("listings");
  return data.getListingFacets(source);
}

export async function getCachedAreaCounts(
  localityId: string,
  source: string | undefined,
  catalogAreas: string[],
) {
  "use cache";
  cacheTag("listings");
  cacheLife("listings");
  return data.getAreaCounts(localityId, source, catalogAreas);
}
