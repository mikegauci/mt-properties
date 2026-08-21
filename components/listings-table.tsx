"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ImageIcon, LayoutGrid, LayoutList, Search, X } from "lucide-react";
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

type SortKey =
  | "title"
  | "locality"
  | "type"
  | "beds"
  | "price"
  | "price_per_sqm"
  | "sqm"
  | "source"
  | "last_seen"
  | "first_seen";
type SortDir = "asc" | "desc";
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
  const [mobileView, setMobileView] = useState<MobileView>("grid");

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

  const localityById = useMemo(() => new Map(localities.map((row) => [row.id, row])), [localities]);

  const tokens = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean).map(normalizeSearchToken),
    [query],
  );

  const filtered = useMemo(() => {
    return uniqueListings.filter((row) => {
      if (source !== "all" && row.source !== source) return false;
      if (localityId && row.locality_id !== localityId) return false;
      if (activeArea && !listingMatchesArea(row, activeArea)) return false;
      if (propertyType !== "all" && row.property_type !== propertyType) return false;
      if (tokens.length && !tokens.every((token) => listingHaystack(row, localityById).includes(token))) {
        return false;
      }
      return true;
    });
  }, [uniqueListings, source, localityId, activeArea, propertyType, tokens, localityById]);

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

  const filtersActive = Boolean(
    query.trim() || source !== "all" || localityId || activeArea || propertyType !== "all",
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
          Showing {from}–{to} of {sorted.length} listings
          {sorted.length !== uniqueListings.length ? ` (filtered from ${uniqueListings.length})` : null}
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
      </div>

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

function normalizeSearchToken(token: string) {
  return token.replace(/[€,\s]/g, "").toLowerCase();
}

function priceSearchText(price: number | null | undefined) {
  if (!price || price <= 0) return "";
  const parts = [String(price)];
  const formatted = new Intl.NumberFormat("en-MT", { maximumFractionDigits: 0 }).format(price);
  parts.push(formatted.replace(/,/g, ""));
  if (price >= 1000) {
    const thousands = price / 1000;
    parts.push(Number.isInteger(thousands) ? `${thousands}k` : `${thousands.toFixed(1).replace(/\.0$/, "")}k`);
  }
  if (price >= 1_000_000) {
    const millions = price / 1_000_000;
    parts.push(Number.isInteger(millions) ? `${millions}m` : `${millions.toFixed(1).replace(/\.0$/, "")}m`);
  }
  return parts.join(" ");
}

function listingHaystack(row: ListingPreview, localityById: Map<string, FilterLocality>) {
  const locality = row.locality_id ? localityById.get(row.locality_id) : undefined;
  const region = locality ? localityRegion(locality) : null;
  return [
    row.localityName,
    row.area,
    region,
    region ? REGION_LABELS[region] : null,
    row.property_type,
    typeLabel(row.property_type),
    priceSearchText(row.price),
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
    case "price_per_sqm":
      return row.price != null && row.sqm != null && row.sqm > 0 ? row.price / row.sqm : null;
    case "sqm":
      return row.sqm;
    case "source":
      return row.source;
    case "last_seen":
      return row.last_seen;
    case "first_seen":
      return row.first_seen;
  }
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

function seenLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-MT", { day: "numeric", month: "short" });
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
          <span
            className={cn(
              "inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[10px] leading-tight font-medium break-words capitalize",
              typeBadgeClass(listing.property_type),
            )}
          >
            {typeLabel(listing.property_type)}
          </span>
          {listing.beds != null ? (
            <span className="text-muted-foreground inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] leading-tight font-medium">
              {listing.beds} bed{listing.beds === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-1 pt-0.5">
          <span className={cn("inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[10px] leading-tight font-medium break-words", theme.badge)}>
            {theme.label}
          </span>
          <span className="text-muted-foreground shrink-0 text-[10px]">{seenLabel(listing.last_seen)}</span>
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
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium break-words capitalize",
              typeBadgeClass(listing.property_type),
            )}
          >
            {typeLabel(listing.property_type)}
          </span>
          {listing.beds != null ? (
            <span className="text-muted-foreground text-xs tabular-nums">{listing.beds} bed{listing.beds === 1 ? "" : "s"}</span>
          ) : null}
          <span className={cn("inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium break-words", theme.badge)}>
            {theme.label}
          </span>
          <span className="text-muted-foreground ml-auto text-[11px]">{seenLabel(listing.last_seen)}</span>
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
