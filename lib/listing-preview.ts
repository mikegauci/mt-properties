import type { FilterLocality } from "@/components/listings-table";
import type { ListingPreview } from "@/components/listings-table";
import type { ListingRow, Locality } from "@/lib/types";

export function toFilterLocality(row: Locality): FilterLocality {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name_en,
    district: row.district,
    island: row.island,
  };
}

export function toListingPreviews(listings: ListingRow[], localities: Locality[]): ListingPreview[] {
  const localityById = new Map(localities.map((row) => [row.id, row]));
  return listings.map((listing) => {
    const locality = listing.locality_id ? localityById.get(listing.locality_id) : undefined;
    const alsoOnSources = (listing.sibling_sources ?? []).filter((source) => source !== listing.source);
    return {
      ...listing,
      localityName: locality?.name_en ?? null,
      localitySlug: locality?.slug ?? null,
      alsoOnSources,
    };
  });
}
