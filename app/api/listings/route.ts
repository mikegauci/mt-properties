import { NextResponse } from "next/server";
import { areasForSlug } from "@/lib/areas";
import {
  getCachedAreaCounts,
  getCachedListingFacets,
  getCachedListingsPage,
} from "@/lib/cached-data";
import { getLocalities } from "@/lib/data";
import { parsePriceParam, parseSortParam } from "@/lib/listings-filter";
import { toFilterLocality, toListingPreviews } from "@/lib/listing-preview";
import { supabaseConfigured } from "@/lib/supabase/server";

const UI_PAGE_SIZE = 50;
const LISTINGS_CACHE_CONTROL = "public, s-maxage=900, stale-while-revalidate=3600";

export async function GET(request: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({
      listings: [],
      localities: [],
      facets: null,
      page: 1,
      pageSize: 0,
      total: 0,
      hasMore: false,
    });
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? String(UI_PAGE_SIZE));
  const localityId = url.searchParams.get("localityId") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const propertyType = url.searchParams.get("propertyType") ?? undefined;
  const excludeTypes = url.searchParams.get("excludeTypes")?.split(",").filter(Boolean) ?? [];
  const priceMin = parsePriceParam(url.searchParams.get("priceMin"));
  const priceMax = parsePriceParam(url.searchParams.get("priceMax"));
  const q = url.searchParams.get("q") ?? undefined;
  const area = url.searchParams.get("area") ?? undefined;
  const includeFacets = url.searchParams.get("facets") === "1";
  const { sortKey, sortDir } = parseSortParam(url.searchParams.get("sort"));

  const localities = await getLocalities();
  const queryInput = {
    page,
    pageSize,
    sortKey,
    sortDir,
    source,
    localityId,
    propertyType,
    excludeTypes,
    priceMin,
    priceMax,
    q,
    area,
  };

  const [result, facets] = await Promise.all([
    getCachedListingsPage(queryInput),
    includeFacets ? getCachedListingFacets(source) : Promise.resolve(null),
  ]);

  let areaCounts: { area: string; count: number }[] | undefined;
  if (includeFacets && localityId) {
    const locality = localities.find((row) => row.id === localityId);
    areaCounts = await getCachedAreaCounts(localityId, source, areasForSlug(locality?.slug));
  }

  return NextResponse.json(
    {
      listings: toListingPreviews(result.listings, localities),
      localities: includeFacets ? localities.map(toFilterLocality) : undefined,
      facets: facets
        ? {
            ...facets,
            areaCounts,
          }
        : null,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      hasMore: result.hasMore,
    },
    {
      headers: {
        "Cache-Control": LISTINGS_CACHE_CONTROL,
      },
    },
  );
}
