"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ImageIcon, LayoutGrid, LayoutList, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { fetchListings, listingsQueryKey } from "@/lib/listings-api";
import type { SortDir, SortKey } from "@/lib/listings-filter";
import { eur, compactNumber, displayTypeLabel, typeLabel } from "@/lib/format";
import { localityRegion, REGION_LABELS, REGIONS } from "@/lib/regions";
import { cn } from "@/lib/utils";
import { canonicalPropertyType, type ListingRow } from "@/lib/types";

export type ListingPreview = ListingRow & {
  localityName: string | null;
  localitySlug: string | null;
  alsoOnSources: string[];
};

export type FilterLocality = {
  id: string;
  slug: string;
  name: string;
  district: string;
  island: "malta" | "gozo";
};

const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

type MobileView = "grid" | "list";

const TEXT_SORT: SortKey[] = ["title", "locality", "type", "source"];

const SORT_PRESETS: { value: `${SortKey}:${SortDir}`; label: string }[] = [
  { value: "last_seen:desc", label: "Most recently seen" },
  { value: "first_seen:desc", label: "Newest listings" },
  { value: "first_seen:asc", label: "Longest on market" },
  { value: "price:asc", label: "Price: low to high" },
  { value: "price:desc", label: "Price: high to low" },
  { value: "price_per_sqm:asc", label: "€/m²: low to high" },
  { value: "price_per_sqm:desc", label: "€/m²: high to low" },
  { value: "sqm:asc", label: "Size: smallest first" },
  { value: "sqm:desc", label: "Size: largest first" },
  { value: "beds:asc", label: "Beds: fewest first" },
  { value: "beds:desc", label: "Beds: most first" },
];

export function ListingsTable() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [source, setSource] = useState<string>("all");
  const [localityId, setLocalityId] = useState("");
  const [area, setArea] = useState("");
  const [propertyType, setPropertyType] = useState<string>("all");
  const [excludePropertyTypes, setExcludePropertyTypes] = useState<string[]>([]);
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_seen");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(DEFAULT_PAGE_SIZE);
  const [mobileView, setMobileView] = useState<MobileView>("grid");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchParams = useMemo(
    () => ({
      page,
      pageSize,
      sortKey,
      sortDir,
      source,
      localityId,
      area,
      propertyType,
      excludePropertyTypes,
      q: debouncedQuery,
      priceFrom,
      priceTo,
      facets: true as const,
    }),
    [
      page,
      pageSize,
      sortKey,
      sortDir,
      source,
      localityId,
      area,
      propertyType,
      excludePropertyTypes,
      debouncedQuery,
      priceFrom,
      priceTo,
    ],
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: listingsQueryKey(fetchParams),
    queryFn: ({ signal }) => fetchListings(fetchParams, signal),
    placeholderData: (previous) => previous,
  });

  const listings = data?.listings ?? [];
  const localities = data?.localities ?? [];
  const facets = data?.facets ?? null;
  const total = data?.total ?? 0;
  const loading = isLoading;
  const errorMessage = error instanceof Error ? error.message : error ? "Could not load listings" : null;

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [total, pageSize, page]);

  const sources = useMemo(
    () => facets?.sourceCounts.map((row) => row.source) ?? [],
    [facets],
  );

  const localityCounts = useMemo(() => new Map(Object.entries(facets?.localityCounts ?? {})), [facets]);

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

  const areaOptions = useMemo(() => {
    const counts = facets?.areaCounts ?? [];
    return counts.map((row) => [row.area, row.count] as [string, number]);
  }, [facets]);

  const propertyTypes = useMemo(
    () =>
      (facets?.propertyTypes ?? [])
        .map((row) => row.type)
        .sort((a, b) => typeLabel(a).localeCompare(typeLabel(b), "en")),
    [facets],
  );

  const activeArea = areaOptions.some(([name]) => name === area) ? area : "";

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const from = total ? (currentPage - 1) * pageSize + 1 : 0;
  const to = Math.min(currentPage * pageSize, total);
  const pageRows = listings;

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
    if (value) {
      setExcludePropertyTypes((current) => current.filter((item) => item !== value));
    }
    setPage(1);
  }

  function toggleExcludeType(value: string) {
    setExcludePropertyTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
    if (propertyType === value) setPropertyType("all");
    setPage(1);
  }

  function applyPriceFrom(value: string) {
    setPriceFrom(formatPriceInput(value));
    setPage(1);
  }

  function applyPriceTo(value: string) {
    setPriceTo(formatPriceInput(value));
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setSource("all");
    setLocalityId("");
    setArea("");
    setPropertyType("all");
    setExcludePropertyTypes([]);
    setPriceFrom("");
    setPriceTo("");
    setPage(1);
  }

  const filtersActive = Boolean(
    query.trim() ||
      source !== "all" ||
      localityId ||
      activeArea ||
      propertyType !== "all" ||
      excludePropertyTypes.length ||
      priceFrom.trim() ||
      priceTo.trim(),
  );

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

  function applySortPreset(value: string) {
    const preset = SORT_PRESETS.find((row) => row.value === value);
    if (!preset) return;
    const [key, dir] = preset.value.split(":") as [SortKey, SortDir];
    setSortKey(key);
    setSortDir(dir);
    setPage(1);
  }

  const sortPresetValue = `${sortKey}:${sortDir}`;
  const sortSelectValue = SORT_PRESETS.some((row) => row.value === sortPresetValue)
    ? sortPresetValue
    : "last_seen:desc";

  if (errorMessage && !localities.length) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">{errorMessage}</p>
        <button
          type="button"
          className="text-sky-700 text-sm underline underline-offset-2"
          onClick={() => {
            void refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (loading && !localities.length) {
    return <p className="text-muted-foreground text-sm">Loading listings…</p>;
  }

  if (!loading && total === 0 && !filtersActive) {
    return (
      <p className="text-muted-foreground text-sm">
        No active listings yet. Run the scraper from Pipeline or locally with{" "}
        <code className="text-xs">npm run scrape:propertymarket</code>.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl bg-gradient-to-br from-sky-50 via-background to-amber-50/70 p-3 ring-1 ring-sky-100/80">
        <div className="relative md:hidden">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => applyQuery(event.target.value)}
            placeholder="Search locality, region, type, price…"
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

        {propertyTypes.length ? (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-muted-foreground self-center text-xs font-medium">Exclude</span>
            {propertyTypes.map((value) => {
              const active = excludePropertyTypes.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleExcludeType(value)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-rose-600 text-white"
                      : "bg-background text-muted-foreground ring-1 ring-inset ring-border hover:bg-muted",
                  )}
                >
                  {typeLabel(value)}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-sky-900/70">
            Price
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                value={priceFrom}
                onChange={(event) => applyPriceFrom(event.target.value)}
                placeholder="From"
                aria-label="Minimum price"
                className="bg-background w-[9rem] tabular-nums"
              />
              <span className="text-muted-foreground text-xs">–</span>
              <Input
                type="text"
                inputMode="numeric"
                value={priceTo}
                onChange={(event) => applyPriceTo(event.target.value)}
                placeholder="To"
                aria-label="Maximum price"
                className="bg-background w-[9rem] tabular-nums"
              />
            </div>
          </label>
        </div>

        <div className="hidden flex-wrap items-end gap-3 md:flex">
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
          <label className="grid gap-1 text-xs font-medium text-sky-900/70">
            Sort
            <select
              className="border-input h-8 w-[14rem] rounded-lg border bg-background px-2.5 text-sm"
              value={sortSelectValue}
              onChange={(event) => applySortPreset(event.target.value)}
            >
              {SORT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          {filtersActive ? (
            <Button type="button" variant="ghost" size="sm" className="text-sky-800" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground min-w-0 flex-1">
          Showing {from}–{to} of {compactNumber(total)} listings
          {` · ${sortLabel(sortKey, sortDir)}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-muted-foreground flex items-center gap-2 md:hidden">
            Sort
            <select
              className="border-input h-8 max-w-[11rem] min-w-0 rounded-lg border bg-transparent px-2 text-sm"
              value={sortSelectValue}
              onChange={(event) => applySortPreset(event.target.value)}
              aria-label="Sort listings"
            >
              {SORT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1 md:hidden" role="group" aria-label="View layout">
            <Button
              type="button"
              variant={mobileView === "grid" ? "default" : "outline"}
              size="icon-sm"
              aria-pressed={mobileView === "grid"}
              aria-label="Grid view"
              onClick={() => setMobileView("grid")}
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              type="button"
              variant={mobileView === "list" ? "default" : "outline"}
              size="icon-sm"
              aria-pressed={mobileView === "list"}
              aria-label="List view"
              onClick={() => setMobileView("list")}
            >
              <LayoutList className="size-4" />
            </Button>
          </div>
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
      </div>

      <div className={cn("space-y-4 transition-opacity", isFetching && localities.length ? "opacity-60" : "")}>
      <div className="md:hidden">
        {mobileView === "grid" ? (
          <div className="grid grid-cols-2 gap-2.5">
            {pageRows.map((listing) => (
              <ListingGridCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {pageRows.map((listing) => (
              <ListingListCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>

      <div className="hidden md:block">
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
                    <ListingThumb href={listing.url} url={listing.image_url} />
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
                  <TypeBadge propertyType={listing.property_type} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{listing.beds ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-emerald-800">
                  {eur(listing.price)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className={cn("inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium", theme.badge)}>
                      {theme.label}
                    </span>
                    <AlsoOnSources sources={listing.alsoOnSources} />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {seenLabel(listing.last_seen)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
      </div>

      {!total ? (
        <p className="text-muted-foreground text-sm">
          {loading ? "Loading listings…" : "No listings match these filters."}
        </p>
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

function formatPriceInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  return compactNumber(Number(digits));
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

function sortLabel(key: SortKey, dir: SortDir) {
  const preset = SORT_PRESETS.find((row) => row.value === `${key}:${dir}`);
  if (preset) return `sorted by ${preset.label.toLowerCase()}`;
  const labels: Record<SortKey, string> = {
    title: "listing",
    locality: "locality",
    type: "type",
    beds: "beds",
    price: "price",
    price_per_sqm: "€/m²",
    sqm: "size",
    source: "source",
    last_seen: "most recently seen",
    first_seen: "first seen",
  };
  if (key === "last_seen" && dir === "desc") return "sorted by most recently seen";
  return `sorted by ${labels[key]}, ${dir === "asc" ? "low to high" : "high to low"}`;
}

function TypeBadge({
  propertyType,
  compact = false,
}: {
  propertyType: string | null | undefined;
  compact?: boolean;
}) {
  const label = displayTypeLabel(propertyType);
  if (!label) return <span className="text-muted-foreground">—</span>;
  const canonical = canonicalPropertyType(propertyType);
  return (
    <span
      className={cn(
        "inline-flex max-w-[8rem] truncate rounded-full font-medium capitalize",
        compact ? "px-1.5 py-0.5 text-[10px] leading-tight" : "px-2 py-0.5 text-xs",
        typeBadgeClass(canonical ?? propertyType),
      )}
      title={label}
    >
      {label}
    </span>
  );
}

function seenLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-MT", { day: "numeric", month: "short" });
}

function alsoOnLabel(sources: string[]) {
  if (!sources.length) return null;
  return sources.map((source) => sourceTheme(source).label).join(", ");
}

function AlsoOnSources({ sources }: { sources: string[] }) {
  const label = alsoOnLabel(sources);
  if (!label) return null;
  return (
    <span className="text-muted-foreground text-[10px] leading-tight" title={`Also listed on ${label}`}>
      Also on {label}
    </span>
  );
}

function ListingGridCard({ listing }: { listing: ListingPreview }) {
  const theme = sourceTheme(listing.source);
  const title = listing.title?.trim() || listing.street || "View listing";

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-sky-100/80 bg-white shadow-sm">
      <ListingImage href={listing.url} url={listing.image_url} variant="grid" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
        <a
          className="line-clamp-2 text-xs leading-snug font-medium break-words text-sky-950 hover:text-sky-700 hover:underline"
          href={listing.url}
          rel="noreferrer"
          target="_blank"
        >
          {title}
        </a>
        <p className="text-sm font-semibold break-words text-emerald-800">{eur(listing.price)}</p>
        <div className="min-w-0 space-y-0.5 text-[11px] leading-snug">
          {listing.localitySlug ? (
            <Link className="block break-words text-teal-800 hover:underline" href={`/localities/${listing.localitySlug}`}>
              {listing.localityName}
            </Link>
          ) : listing.localityName ? (
            <span className="block break-words text-teal-800">{listing.localityName}</span>
          ) : null}
          {listing.area ? <span className="text-muted-foreground block break-words">{listing.area}</span> : null}
        </div>
        <div className="flex min-w-0 flex-wrap gap-1">
          <TypeBadge propertyType={listing.property_type} compact />
          {listing.beds != null ? (
            <span className="text-muted-foreground inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] leading-tight font-medium">
              {listing.beds} bed{listing.beds === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <div className="mt-auto flex min-w-0 flex-col gap-0.5 pt-0.5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
            <span className={cn("inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[10px] leading-tight font-medium break-words", theme.badge)}>
              {theme.label}
            </span>
            <span className="text-muted-foreground shrink-0 text-[10px]">{seenLabel(listing.last_seen)}</span>
          </div>
          <AlsoOnSources sources={listing.alsoOnSources} />
        </div>
      </div>
    </article>
  );
}

function ListingListCard({ listing }: { listing: ListingPreview }) {
  const theme = sourceTheme(listing.source);
  const title = listing.title?.trim() || listing.street || "View listing";

  return (
    <article className="flex min-w-0 gap-2.5 overflow-hidden rounded-lg border border-sky-100/80 bg-white p-2 shadow-sm">
      <ListingImage href={listing.url} url={listing.image_url} variant="list" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <a
          className="line-clamp-2 text-sm leading-snug font-medium break-words text-sky-950 hover:text-sky-700 hover:underline"
          href={listing.url}
          rel="noreferrer"
          target="_blank"
        >
          {title}
        </a>
        {listing.street && listing.title ? (
          <span className="text-muted-foreground line-clamp-1 text-xs break-words">{listing.street}</span>
        ) : null}
        <p className="text-base font-semibold break-words text-emerald-800">{eur(listing.price)}</p>
        <div className="min-w-0 text-xs leading-snug">
          {listing.localitySlug ? (
            <Link className="break-words text-teal-800 hover:underline" href={`/localities/${listing.localitySlug}`}>
              {listing.localityName}
            </Link>
          ) : (
            (listing.localityName ?? null)
          )}
          {listing.area ? <span className="text-muted-foreground block break-words">{listing.area}</span> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <TypeBadge propertyType={listing.property_type} compact />
            {listing.beds != null ? (
              <span className="text-muted-foreground text-xs tabular-nums">{listing.beds} bed{listing.beds === 1 ? "" : "s"}</span>
            ) : null}
            <span className={cn("inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium break-words", theme.badge)}>
              {theme.label}
            </span>
            <span className="text-muted-foreground ml-auto text-[11px]">{seenLabel(listing.last_seen)}</span>
          </div>
          <AlsoOnSources sources={listing.alsoOnSources} />
        </div>
      </div>
    </article>
  );
}

function ListingThumb({ href, url }: { href: string; url: string | null }) {
  return <ListingImage href={href} url={url} variant="table" />;
}

function ListingImage({
  href,
  url,
  variant,
}: {
  href: string;
  url: string | null;
  variant: "table" | "grid" | "list";
}) {
  const [failed, setFailed] = useState(false);
  const placeholder = (
    <div
      className={cn(
        "bg-sky-50 text-muted-foreground flex shrink-0 items-center justify-center",
        variant === "grid" && "aspect-[4/3] w-full rounded-t-lg",
        variant === "list" && "size-20 rounded-md",
        variant === "table" && "size-14 rounded-md",
      )}
    >
      <ImageIcon className={variant === "grid" ? "size-5" : "size-4"} />
    </div>
  );
  const image = !url || failed ? (
    placeholder
  ) : (
    <img
      alt=""
      className={cn(
        "bg-sky-50 shrink-0 object-cover",
        variant === "grid" && "aspect-[4/3] w-full rounded-t-lg",
        variant === "list" && "size-20 rounded-md",
        variant === "table" && "size-14 rounded-md",
      )}
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={url}
    />
  );
  return (
    <a className={cn("shrink-0", variant === "grid" && "block w-full min-w-0")} href={href} rel="noreferrer" target="_blank">
      {image}
    </a>
  );
}
