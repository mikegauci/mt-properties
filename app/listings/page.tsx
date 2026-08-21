import { KpiCard } from "@/components/kpi-card";
import { sourceTheme } from "@/components/listing-theme";
import { ListingsTable, type ListingPreview } from "@/components/listings-table";
import { SetupBanner } from "@/components/setup-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { askingStats, getActiveListings, getListingCounts, getLocalities } from "@/lib/data";
import { eur } from "@/lib/format";
import { supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const configured = supabaseConfigured();
  const [listings, localities, counts] = configured
    ? await Promise.all([getActiveListings(), getLocalities(), getListingCounts()])
    : [[], [], []];

  const localityById = new Map(localities.map((row) => [row.id, row]));
  const previews: ListingPreview[] = listings.map((listing) => {
    const locality = listing.locality_id ? localityById.get(listing.locality_id) : undefined;
    return {
      ...listing,
      localityName: locality?.name_en ?? null,
      localitySlug: locality?.slug ?? null,
    };
  });

  const stats = askingStats(listings);
  const sourcesWithListings = counts.filter((row) => row.count > 0).length;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-gradient-to-br from-sky-50 via-amber-50/50 to-emerald-50 px-6 py-6 ring-1 ring-sky-100/80">
        <h1 className="text-3xl font-semibold tracking-tight text-sky-950">Listings</h1>
        <p className="mt-2 max-w-2xl text-sm text-sky-900/70">
          Active agency asking prices scraped from public feeds. Click a row to open the original listing.
        </p>
      </div>

      {!configured ? <SetupBanner /> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active listings"
          value={String(stats.sample)}
          hint="Priced listings in the database"
          tone="index"
        />
        <KpiCard label="Median asking" value={eur(stats.medianPrice)} hint="Across all active listings" tone="ask" />
        <KpiCard
          label="Median asking €/m²"
          value={eur(stats.medianPerSqm)}
          hint={stats.sample < 8 ? "Low sample — treat as directional." : "Listings with floor area"}
          tone="up"
        />
        <KpiCard
          label="Sources"
          value={String(sourcesWithListings)}
          hint={counts.map((row) => `${sourceTheme(row.source).label} (${row.count})`).join(" · ") || "No sources yet"}
        />
      </section>

      <Card className="gap-0 overflow-hidden py-0 ring-sky-100/80">
        <CardHeader className="border-b border-sky-100/80 bg-gradient-to-r from-sky-50/80 to-amber-50/40 py-4">
          <CardTitle className="text-sky-950">Property Listings</CardTitle>
          <CardDescription>
            Filter by source, locality, or type. Sort any column — 50 per page by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-4">
          {previews.length ? (
            <ListingsTable
              listings={previews}
              localities={localities.map((row) => ({
                id: row.id,
                slug: row.slug,
                name: row.name_en,
                district: row.district,
                island: row.island,
              }))}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No active listings yet. Run the scraper from Pipeline or locally with{" "}
              <code className="text-xs">npm run scrape:propertymarket</code>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
