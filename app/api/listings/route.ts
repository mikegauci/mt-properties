import { NextResponse } from "next/server";
import { SUPABASE_PAGE_SIZE } from "@/lib/db/paginate";
import { getActiveListingsPage, getLocalities } from "@/lib/data";
import { toFilterLocality, toListingPreviews } from "@/lib/listing-preview";
import { supabaseConfigured } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ listings: [], localities: [], page: 1, pageSize: 0, total: 0, hasMore: false });
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? String(SUPABASE_PAGE_SIZE));
  const localityId = url.searchParams.get("localityId") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;

  const [result, localities] = await Promise.all([
    getActiveListingsPage({ page, pageSize, localityId, source }),
    getLocalities(),
  ]);

  return NextResponse.json({
    listings: toListingPreviews(result.listings, localities),
    localities: page <= 1 ? localities.map(toFilterLocality) : undefined,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    hasMore: result.hasMore,
  });
}
