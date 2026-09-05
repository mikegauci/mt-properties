import { NextResponse } from "next/server";
import { areasForSlug, listingMatchesArea } from "@/lib/areas";
import { paginate } from "@/lib/db/paginate";
import { getActiveListingsPage, getListingFacets, getLocalities } from "@/lib/data";
import { parsePriceParam, parseSortParam } from "@/lib/listings-filter";
import { toFilterLocality, toListingPreviews } from "@/lib/listing-preview";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";

const UI_PAGE_SIZE = 50;

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
    getActiveListingsPage(queryInput, localities),
    includeFacets ? getListingFacets(source) : Promise.resolve(null),
  ]);

  let areaCounts: { area: string; count: number }[] | undefined;
  if (includeFacets && localityId) {
    areaCounts = await getAreaCounts(localityId, source, localities);
  }

  return NextResponse.json({
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
  });
}

async function getAreaCounts(
  localityId: string,
  source: string | undefined,
  localities: Awaited<ReturnType<typeof getLocalities>>,
) {
  const supabase = supabaseAdmin();
  if (!supabase) return [];

  const locality = localities.find((row) => row.id === localityId);
  const names = new Set(areasForSlug(locality?.slug));

  type AreaRow = { area: string | null; title: string | null; street: string | null; source: string };
  const rows = await paginate<AreaRow>((from, to) =>
    supabase
      .from("listings")
      .select("area, title, street, source")
      .eq("is_active", true)
      .gt("price", 0)
      .eq("locality_id", localityId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  for (const row of rows) {
    if (row.area) names.add(row.area);
  }

  const counts: { area: string; count: number }[] = [];
  for (const name of names) {
    let count = 0;
    for (const row of rows) {
      if (source && source !== "all" && row.source !== source) continue;
      if (listingMatchesArea(row, name)) count += 1;
    }
    if (count) counts.push({ area: name, count });
  }

  return counts.sort((left, right) => left.area.localeCompare(right.area, "en"));
}
