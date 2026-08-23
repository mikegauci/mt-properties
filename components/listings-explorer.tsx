"use client";

import { useEffect, useState } from "react";
import {
  ListingsTable,
  type FilterLocality,
  type ListingPreview,
} from "@/components/listings-table";

type ListingsPage = {
  listings: ListingPreview[];
  localities?: FilterLocality[];
  hasMore: boolean;
};

async function fetchAllListings(): Promise<{ listings: ListingPreview[]; localities: FilterLocality[] }> {
  let page = 1;
  let listings: ListingPreview[] = [];
  let localities: FilterLocality[] = [];
  while (true) {
    const response = await fetch(`/api/listings?page=${page}&pageSize=2000`);
    if (!response.ok) throw new Error("Could not load listings");
    const data = (await response.json()) as ListingsPage;
    if (page === 1 && data.localities) localities = data.localities;
    listings = listings.concat(data.listings);
    if (!data.hasMore) break;
    page += 1;
  }
  return { listings, localities };
}

export function ListingsExplorer() {
  const [listings, setListings] = useState<ListingPreview[] | null>(null);
  const [localities, setLocalities] = useState<FilterLocality[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllListings()
      .then((data) => {
        if (cancelled) return;
        setListings(data.listings);
        setLocalities(data.localities);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load listings");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-muted-foreground text-sm">{error}</p>;
  }

  if (!listings || !localities) {
    return <p className="text-muted-foreground text-sm">Loading listings…</p>;
  }

  if (!listings.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No active listings yet. Run the scraper from Pipeline or locally with{" "}
        <code className="text-xs">npm run scrape:propertymarket</code>.
      </p>
    );
  }

  return <ListingsTable listings={listings} localities={localities} />;
}
