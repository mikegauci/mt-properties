"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ImageIcon, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { FilterCombobox } from "@/components/filter-combobox";
import { sourceTheme, typeBadgeClass } from "@/components/listing-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { areasForSlug, listingMatchesArea } from "@/lib/areas";
import { eur, typeLabel } from "@/lib/format";
import { localityRegion, REGION_LABELS, REGIONS } from "@/lib/regions";
import { cn } from "@/lib/utils";
import type { ListingRow } from "@/lib/types";

export type ListingPreview = ListingRow & {
  localityName: string | null;
  localitySlug: string | null;
};

export type FilterLocality = {
  id: string;
  slug: string;
  name: string;
  district: string;
  island: "malta" | "gozo";
};

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

type SortKey = "title" | "locality" | "type" | "beds" | "price" | "source" | "last_seen";
type SortDir = "asc" | "desc";

const TEXT_SORT: SortKey[] = ["title", "locality", "type", "source"];

export function ListingsTable({
  listings,
  localities,
}: {
  listings: ListingPreview[];
  localities: FilterLocality[];
}) {
  const uniqueListings = useMemo(() => {
    const seen = new Set<string>();
    return listings.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [listings]);

  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string>("all");
  const [localityId, setLocalityId] = useState("");
  const [area, setArea] = useState("");
  const [propertyType, setPropertyType] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("last_seen");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(DEFAULT_PAGE_SIZE);

  const sources = useMemo(
    () => [...new Set(uniqueListings.map((row) => row.source))].sort(),
    [uniqueListings],
  );

  const localityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of uniqueListings) {
      if (!row.locality_id) continue;
      counts.set(row.locality_id, (counts.get(row.locality_id) ?? 0) + 1);
    }
    return counts;
  }, [uniqueListings]);

  const localityGroups = useMemo(
    () =>
      REGIONS.map((region) => ({
        region,
        label: REGION_LABELS[region],
        localities: localities
          .filter((row) => localityRegion(row) === region)
          .sort((a, b) => a.name.localeCompare(b.name, "en")),
      })).filter((group) => group.localities.length),
    [localities],
  );

  const selectedLocality = useMemo(
    () => localities.find((row) => row.id === localityId) ?? null,
    [localities, localityId],
  );

  const areaOptions = useMemo(() => {
    if (!selectedLocality) return [];
    const names = new Set(areasForSlug(selectedLocality.slug));
    for (const row of uniqueListings) {
      if (row.locality_id === localityId && row.area) names.add(row.area);
    }
    const counts: [string, number][] = [];
    for (const name of names) {
      let count = 0;
      for (const row of uniqueListings) {
        if (row.locality_id !== localityId) continue;
        if (source !== "all" && row.source !== source) continue;
        if (listingMatchesArea(row, name)) count += 1;
      }
      if (count) counts.push([name, count]);
    }
    return counts.sort((a, b) => a[0].localeCompare(b[0], "en"));
  }, [uniqueListings, selectedLocality, localityId, source]);

  const propertyTypes = useMemo(
    () =>
      [...new Set(uniqueListings.map((row) => row.property_type).filter(Boolean) as string[])].sort(
        (a, b) => typeLabel(a).localeCompare(typeLabel(b), "en"),
      ),
    [uniqueListings],
  );

  const activeArea = areaOptions.some(([name]) => name === area) ? area : "";

  const tokens = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  const filtered = useMemo(() => {
    return uniqueListings.filter((row) => {
      if (source !== "all" && row.source !== source) return false;
      if (localityId && row.locality_id !== localityId) return false;
      if (activeArea && !listingMatchesArea(row, activeArea)) return false;
      if (propertyType !== "all" && row.property_type !== propertyType) return false;
      if (tokens.length && !tokens.every((token) => listingHaystack(row).includes(token))) return false;
      return true;
    });
  }, [uniqueListings, source, localityId, activeArea, propertyType, tokens]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((left, right) => compareListings(left, right, sortKey, sortDir));
    return rows;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const from = sorted.length ? (currentPage - 1) * pageSize + 1 : 0;
  const to = Math.min(currentPage * pageSize, sorted.length);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function applyQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function applySource(value: string) {
    setSource(value);
    setPage(1);
  }

  function applyLocality(value: string) {
    setLocalityId(value);
    setArea("");
    setPage(1);
  }

  function applyArea(value: string) {
    setArea(value);
    setPage(1);
  }

  function applyType(value: string) {
    setPropertyType(value || "all");
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setSource("all");
    setLocalityId("");
    setArea("");
    setPropertyType("all");
    setPage(1);
  }

  const filtersActive = Boolean(query.trim() || source !== "all" || localityId || activeArea || propertyType !== "all");

  const localityOptions = localityGroups.flatMap((group) =>
    group.localities.map((row) => {
      const count = localityCounts.get(row.id) ?? 0;
      return {
        value: row.id,
        label: row.name,
        hint: count ? String(count) : undefined,
        group: group.label,
      };
    }),
  );

  const typeOptions = propertyTypes.map((value) => ({
    value,
    label: typeLabel(value),
  }));

  const areaSelectOptions = areaOptions.map(([name, count]) => ({
    value: name,
    label: name,
    hint: String(count),
  }));

  function applySort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(TEXT_SORT.includes(key) ? "asc" : "desc");
    }
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl bg-gradient-to-br from-sky-50 via-background to-amber-50/70 p-3 ring-1 ring-sky-100/80">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => applyQuery(event.target.value)}
            placeholder="Search title, street, locality, type…"
            aria-label="Search listings"
            autoComplete="off"
            className="bg-background h-9 pr-9 pl-9"
          />
          {query ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1"
              onClick={() => applyQuery("")}
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => applySource("all")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              source === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground ring-1 ring-inset ring-border hover:bg-muted",
            )}
          >
            All sources
          </button>
          {sources.map((value) => {
            const theme = sourceTheme(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => applySource(value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  source === value ? theme.badgeActive : theme.badge,
                )}
              >
                {theme.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-sky-900/70">
            Locality
            <FilterCombobox
              value={localityId}
              onChange={applyLocality}
              options={localityOptions}
              placeholder="Type a locality"
              emptyLabel="All localities"
              className="w-[16rem]"
            />
          </label>
          {localityId && areaOptions.length ? (
            <label className="grid gap-1 text-xs font-medium text-sky-900/70">
              Area
              <FilterCombobox
                value={activeArea}
                onChange={applyArea}
                options={areaSelectOptions}
                placeholder="Type an area"
                emptyLabel="All areas"
                className="w-[14rem]"
              />
            </label>
          ) : null}
          {propertyTypes.length ? (
            <label className="grid gap-1 text-xs font-medium text-sky-900/70">
              Type
              <FilterCombobox
                value={propertyType === "all" ? "" : propertyType}
                onChange={applyType}
                options={typeOptions}
                placeholder="Type a property type"
                emptyLabel="All types"
                className="w-[14rem]"
              />
            </label>
          ) : null}
          {filtersActive ? (
            <Button type="button" variant="ghost" size="sm" className="text-sky-800" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          Showing {from}–{to} of {sorted.length} listings
          {sorted.length !== uniqueListings.length ? ` (filtered from ${uniqueListings.length})` : null}
          {` · ${sortLabel(sortKey, sortDir)}`}
        </p>
        <label className="text-muted-foreground flex items-center gap-2">
          Per page
          <select
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-sky-50/70 hover:bg-sky-50/70">
            <SortHead label="Listing" column="title" sortKey={sortKey} sortDir={sortDir} onSort={applySort} />
            <SortHead label="Locality" column="locality" sortKey={sortKey} sortDir={sortDir} onSort={applySort} />
            <SortHead label="Type" column="type" sortKey={sortKey} sortDir={sortDir} onSort={applySort} />
            <SortHead
              label="Beds"
              column="beds"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={applySort}
              className="text-right"
            />
            <SortHead
              label="Price"
              column="price"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={applySort}
              className="text-right"
            />
            <SortHead label="Source" column="source" sortKey={sortKey} sortDir={sortDir} onSort={applySort} />
            <SortHead label="Seen" column="last_seen" sortKey={sortKey} sortDir={sortDir} onSort={applySort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((listing) => {
            const theme = sourceTheme(listing.source);
            return (
              <TableRow key={listing.id} className="hover:bg-sky-50/50">
                <TableCell className="max-w-xs whitespace-normal">
                  <div className="flex items-start gap-3">
                    <ListingThumb url={listing.image_url} />
                    <div className="min-w-0">
                      <a
                        className="line-clamp-2 font-medium text-sky-950 hover:text-sky-700 hover:underline"
                        href={listing.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {listing.title?.trim() || listing.street || "View listing"}
                      </a>
                      {listing.street && listing.title ? (
                        <div className="text-muted-foreground mt-1 text-xs">{listing.street}</div>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {listing.localitySlug ? (
                    <Link className="text-teal-800 hover:underline" href={`/localities/${listing.localitySlug}`}>
                      {listing.localityName}
                    </Link>
                  ) : (
                    (listing.localityName ?? "—")
                  )}
                  {listing.area ? <div className="text-muted-foreground mt-0.5 text-xs">{listing.area}</div> : null}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      typeBadgeClass(listing.property_type),
                    )}
                  >
                    {typeLabel(listing.property_type)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{listing.beds ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-emerald-800">
                  {eur(listing.price)}
                </TableCell>
                <TableCell>
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", theme.badge)}>
                    {theme.label}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {seenLabel(listing.last_seen)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {!sorted.length ? (
        <p className="text-muted-foreground text-sm">No listings match these filters.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Page {currentPage} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function listingHaystack(row: ListingPreview) {
  return [
    row.title,
    row.street,
    row.localityName,
    row.area,
    row.property_type,
    typeLabel(row.property_type),
    sourceTheme(row.source).label,
    row.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function SortHead({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
          className?.includes("text-right") && "w-full justify-end",
        )}
        onClick={() => onSort(column)}
      >
        {label}
        <Icon className="size-3.5 opacity-70" />
      </button>
    </TableHead>
  );
}

function compareListings(left: ListingPreview, right: ListingPreview, key: SortKey, dir: SortDir) {
  const a = sortValue(left, key);
  const b = sortValue(right, key);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  let result = 0;
  if (typeof a === "number" && typeof b === "number") result = a - b;
  else result = String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

function sortValue(row: ListingPreview, key: SortKey): string | number | null {
  switch (key) {
    case "title":
      return row.title?.trim() || row.street || null;
    case "locality":
      return row.localityName;
    case "type":
      return row.property_type;
    case "beds":
      return row.beds;
    case "price":
      return row.price;
    case "source":
      return row.source;
    case "last_seen":
      return row.last_seen;
  }
}

function sortLabel(key: SortKey, dir: SortDir) {
  const labels: Record<SortKey, string> = {
    title: "listing",
    locality: "locality",
    type: "type",
    beds: "beds",
    price: "price",
    source: "source",
    last_seen: "most recently seen",
  };
  if (key === "last_seen" && dir === "desc") return "sorted by most recently seen";
  return `sorted by ${labels[key]}, ${dir === "asc" ? "low to high" : "high to low"}`;
}

function seenLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-MT", { day: "numeric", month: "short" });
}

function ListingThumb({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="bg-sky-50 text-muted-foreground flex size-14 shrink-0 items-center justify-center rounded-md">
        <ImageIcon className="size-4" />
      </div>
    );
  }
  return (
    <img
      alt=""
      className="bg-sky-50 size-14 shrink-0 rounded-md object-cover"
      height={56}
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={url}
      width={56}
    />
  );
}
