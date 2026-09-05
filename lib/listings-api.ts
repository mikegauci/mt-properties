import type { FilterLocality, ListingPreview } from "@/components/listings-table";
import type { SortDir, SortKey } from "@/lib/listings-filter";

export type ListingsFacets = {
  sourceCounts: { source: string; count: number }[];
  localityCounts: Record<string, number>;
  propertyTypes: { type: string; count: number }[];
  areaCounts?: { area: string; count: number }[];
};

export type ListingsApiResponse = {
  listings: ListingPreview[];
  localities?: FilterLocality[];
  facets: ListingsFacets | null;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type ListingsFetchParams = {
  page: number;
  pageSize: number;
  sortKey: SortKey;
  sortDir: SortDir;
  source: string;
  localityId: string;
  area: string;
  propertyType: string;
  excludePropertyTypes: string[];
  q: string;
  priceFrom: string;
  priceTo: string;
  facets: boolean;
};

function parsePriceParam(value: string): string | null {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  return digits;
}

export function buildListingsSearchParams(params: ListingsFetchParams): URLSearchParams {
  const search = new URLSearchParams();
  search.set("page", String(params.page));
  search.set("pageSize", String(params.pageSize));
  search.set("sort", `${params.sortKey}:${params.sortDir}`);
  if (params.source !== "all") search.set("source", params.source);
  if (params.localityId) search.set("localityId", params.localityId);
  if (params.area) search.set("area", params.area);
  if (params.propertyType !== "all") search.set("propertyType", params.propertyType);
  if (params.excludePropertyTypes.length) {
    search.set("excludeTypes", params.excludePropertyTypes.join(","));
  }
  if (params.q.trim()) search.set("q", params.q.trim());
  const priceMin = parsePriceParam(params.priceFrom);
  const priceMax = parsePriceParam(params.priceTo);
  if (priceMin) search.set("priceMin", priceMin);
  if (priceMax) search.set("priceMax", priceMax);
  if (params.facets) search.set("facets", "1");
  return search;
}

export async function fetchListings(
  params: ListingsFetchParams,
  signal?: AbortSignal,
): Promise<ListingsApiResponse> {
  const search = buildListingsSearchParams(params);
  const response = await fetch(`/api/listings?${search}`, { signal });
  if (!response.ok) throw new Error("Could not load listings");
  return (await response.json()) as ListingsApiResponse;
}
