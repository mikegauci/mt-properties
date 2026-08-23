import { KpiCard } from "@/components/kpi-card";
import { sourceTheme } from "@/components/listing-theme";
import { ListingsExplorer } from "@/components/listings-explorer";
import { SetupBanner } from "@/components/setup-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCachedActiveListingStats } from "@/lib/cached-data";
import { eur } from "@/lib/format";
import { supabaseConfigured } from "@/lib/supabase/server";

export default async function ListingsPage() {
  const configured = supabaseConfigured();
  const { stats, counts } = configured
    ? await getCachedActiveListingStats()
    : { stats: { sample: 0, medianPrice: null, medianPerSqm: null, p25PerSqm: null, p75PerSqm: null }, counts: [] };
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
            On mobile, search by locality, region, type, or price. On desktop, use the filters below. Sort by
            price, €/m², size, and more — 50 per page by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-4">
          {configured ? <ListingsExplorer /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
