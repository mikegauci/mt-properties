"use client";

import { useEffect, useState } from "react";
import {
  ListingsTable,
  type FilterLocality,
  type ListingPreview,
} from "@/components/listings-table";

export function ListingsExplorer() {
  const [listings, setListings] = useState<ListingPreview[] | null>(null);
  const [localities, setLocalities] = useState<FilterLocality[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load listings");
        return response.json() as Promise<{ listings: ListingPreview[]; localities: FilterLocality[] }>;
      })
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
