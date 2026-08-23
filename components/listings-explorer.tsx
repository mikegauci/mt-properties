"use client";

import { useEffect, useState } from "react";
import {
  ListingsTable,
  type FilterLocality,
  type ListingPreview,
} from "@/components/listings-table";
import { SUPABASE_PAGE_SIZE } from "@/lib/db/paginate";

type ListingsPage = {
  listings: ListingPreview[];
  localities?: FilterLocality[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

const FETCH_CONCURRENCY = 6;
const MAX_RETRIES = 3;

function loadErrorMessage(err: unknown) {
  if (!(err instanceof Error)) return "Could not load listings";
  if (err.message === "Load failed" || err.message === "Failed to fetch") {
    return "Could not load listings. Check your connection and try again.";
  }
  return err.message;
}

async function fetchListingsPage(page: number): Promise<ListingsPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(`/api/listings?page=${page}&pageSize=${SUPABASE_PAGE_SIZE}`);
      if (!response.ok) throw new Error("Could not load listings");
      return (await response.json()) as ListingsPage;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function fetchAllListings(): Promise<{ listings: ListingPreview[]; localities: FilterLocality[] }> {
  const first = await fetchListingsPage(1);
  const localities = first.localities ?? [];
  let listings = first.listings;

  if (!first.hasMore) {
    return { listings, localities };
  }

  const totalPages = Math.max(1, Math.ceil(first.total / first.pageSize));
  const remainingPages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);

  for (let offset = 0; offset < remainingPages.length; offset += FETCH_CONCURRENCY) {
    const batch = remainingPages.slice(offset, offset + FETCH_CONCURRENCY);
    const pages = await Promise.all(batch.map((page) => fetchListingsPage(page)));
    for (const data of pages) {
      listings = listings.concat(data.listings);
    }
  }

  return { listings, localities };
}

export function ListingsExplorer() {
  const [listings, setListings] = useState<ListingPreview[] | null>(null);
  const [localities, setLocalities] = useState<FilterLocality[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAllListings()
      .then((data) => {
        if (cancelled) return;
        setListings(data.listings);
        setLocalities(data.localities);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(loadErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          type="button"
          className="text-sky-700 text-sm underline underline-offset-2"
          onClick={() => {
            setListings(null);
            setLocalities(null);
            setError(null);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
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
