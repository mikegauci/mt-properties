import { KpiCard } from "@/components/kpi-card";
import { LocalitiesTable } from "@/components/localities-table";
import { PriceIndexChart } from "@/components/price-index-chart";
import { SetupBanner } from "@/components/setup-banner";
import { YearCompare } from "@/components/year-compare";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCachedActiveListingStats,
  getCachedAskingListingsForCompare,
  getCachedLocalityDeedTable,
  getCachedNationalTransactions,
  getCachedPriceIndex,
} from "@/lib/cached-data";
import { eur, eurDelta, pct } from "@/lib/format";
import { buildAnnualIndex, buildDeclaredByYear } from "@/lib/year-compare";
import { supabaseConfigured } from "@/lib/supabase/server";

export default async function HomePage() {
  const configured = supabaseConfigured();
  const [index, national, localityDeeds, { stats: asking }, askingListings] = configured
    ? await Promise.all([
        getCachedPriceIndex(),
        getCachedNationalTransactions(),
        getCachedLocalityDeedTable(),
        getCachedActiveListingStats(),
        getCachedAskingListingsForCompare(),
      ])
    : [[], [], [], { stats: { sample: 0, medianPrice: null, medianPerSqm: null, p25PerSqm: null, p75PerSqm: null } }, []];

  const latestIndex = [...index].at(-1);
  const latestYear = [...national].filter((row) => row.period_type === "year").at(-1);
  const nationalAvg =
    latestYear?.deeds && latestYear.total_value ? latestYear.total_value / latestYear.deeds : null;
  const gap =
    asking.medianPrice && nationalAvg ? ((asking.medianPrice - nationalAvg) / nationalAvg) * 100 : null;
  const askingGapEur =
    asking.medianPrice != null && nationalAvg != null ? asking.medianPrice - nationalAvg : null;
  const indexByYear = buildAnnualIndex(index);
  const declaredByYear = buildDeclaredByYear(national);
  const listingLocalityIds = new Set(
    askingListings.map((row) => row.localityId).filter((id): id is string => Boolean(id)),
  );
  const compareLocalities = [...localityDeeds]
    .filter(({ locality }) => listingLocalityIds.has(locality.id))
    .map(({ locality }) => ({ id: locality.id, name: locality.name_en }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-muted-foreground text-sm">Malta · personal research</p>
        <h1 className="text-3xl font-semibold tracking-tight">Property market</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          Sold-price change comes from the official house-price index (NSO via Eurostat). Locality €/m²
          comes from agency asking prices. NSO does not publish declared sale values by town.
        </p>
      </div>

      {!configured ? <SetupBanner /> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Official index YoY"
          value={pct(latestIndex?.yoy_pct)}
          hint="National sold-price index, quality-adjusted. Latest Eurostat HPI for Malta."
          tone={(latestIndex?.yoy_pct ?? 0) >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="National avg declared"
          value={eur(nationalAvg)}
          hint="NSO deed total value ÷ deed count. Mix of every property type."
          tone="index"
        />
        <KpiCard
          label="Median asking"
          value={eur(asking.medianPrice)}
          hint={`${asking.sample} active agency listings. Empty until the scraper has run.`}
          tone="ask"
        />
        <KpiCard
          label="Asking vs declared"
          value={eurDelta(askingGapEur)}
          hint={
            asking.medianPrice != null && nationalAvg != null
              ? `Example: listed at ${eur(asking.medianPrice)}, typical sold price ${eur(nationalAvg)} (${pct(gap)}).`
              : "Positive means asking prices sit above the latest national declared average."
          }
          tone={(askingGapEur ?? 0) >= 0 ? "ask" : "down"}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>House price index</CardTitle>
          <CardDescription>2015 = 100. National, not locality-level.</CardDescription>
        </CardHeader>
        <CardContent>
          <PriceIndexChart series={index} />
        </CardContent>
      </Card>

      {configured ? (
        <YearCompare
          indexByYear={indexByYear}
          declaredByYear={declaredByYear}
          listings={askingListings}
          localities={compareLocalities}
        />
      ) : null}

      <LocalitiesTable rows={localityDeeds} />
    </div>
  );
}
