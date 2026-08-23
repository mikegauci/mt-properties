import { NextResponse } from "next/server";
import { getActiveListings, getLocalities } from "@/lib/data";
import { supabaseConfigured } from "@/lib/supabase/server";

export async function GET() {
  if (!supabaseConfigured()) {
    return NextResponse.json({ listings: [], localities: [] });
  }

  const [listings, localities] = await Promise.all([getActiveListings(), getLocalities()]);
  const localityById = new Map(localities.map((row) => [row.id, row]));
  const previews = listings.map((listing) => {
    const locality = listing.locality_id ? localityById.get(listing.locality_id) : undefined;
    return {
      ...listing,
      localityName: locality?.name_en ?? null,
      localitySlug: locality?.slug ?? null,
    };
  });

  return NextResponse.json({
    listings: previews,
    localities: localities.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name_en,
      district: row.district,
      island: row.island,
    })),
  });
}
