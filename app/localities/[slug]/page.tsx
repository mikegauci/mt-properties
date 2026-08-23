import Link from "next/link";
import { notFound } from "next/navigation";
import { DeedsChart } from "@/components/deeds-chart";
import { KpiCard } from "@/components/kpi-card";
import { PeriodCompare } from "@/components/period-compare";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { snapshotStats } from "@/lib/data";
import {
  getCachedActiveListings,
  getCachedLocality,
  getCachedLocalityTransactions,
  getCachedPeriodCompare,
} from "@/lib/cached-data";
import { compactNumber, displayTypeLabel, eur } from "@/lib/format";

export default async function LocalityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { slug } = await params;
  const { days: daysParam } = await searchParams;
  const locality = await getCachedLocality(slug);
  if (!locality) notFound();

  const days = [30, 90, 180].includes(Number(daysParam)) ? Number(daysParam) : 90;

  const [transactions, listings, periodCompare] = await Promise.all([
    getCachedLocalityTransactions(locality.id),
    getCachedActiveListings({ localityId: locality.id }),
    getCachedPeriodCompare(locality.id, days),
  ]);

  const current = snapshotStats(periodCompare.current);
  const previous = snapshotStats(periodCompare.previous);
  const live = snapshotStats(
    listings.map((row) => ({ price: row.price ?? 0, sqm: row.sqm })),
  );

  const deedRow = transactions.at(-1);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          All localities
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{locality.name_en}</h1>
        <p className="text-muted-foreground text-sm">
          {locality.name_mt} · {locality.district} · {locality.island === "gozo" ? "Gozo" : "Malta"}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="NSO deeds (latest window)"
          value={compactNumber(deedRow?.deeds)}
          hint="Counts only. NSO does not publish declared values by locality."
        />
        <KpiCard
          label="Median asking (live)"
          value={eur(live.medianPrice)}
          hint={`${live.sample} active listings today`}
        />
        <KpiCard
          label="Median asking €/m² (live)"
          value={eur(live.medianPerSqm)}
          hint={live.sample < 8 ? "Low sample — treat as directional." : "Active listings with floor area"}
        />
      </section>

      <div className="flex flex-wrap gap-2 text-sm">
        {[30, 90, 180].map((value) => (
          <Link key={value} href={`/localities/${locality.slug}?days=${value}`}>
            <Badge variant={value === days ? "default" : "secondary"}>{value} day window</Badge>
          </Link>
        ))}
      </div>

      <PeriodCompare
        current={current}
        previous={previous}
        windowLabel={`last ${days} days vs previous ${days} days (price snapshots)`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Deed volume</CardTitle>
          <CardDescription>NSO locality counts when published.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeedsChart rows={transactions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active listings</CardTitle>
          <CardDescription>Public agency asking prices currently in the database.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Street</TableHead>
                <TableHead className="text-right">Int. m²</TableHead>
                <TableHead className="text-right">Ext. m²</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listings.slice(0, 40).map((listing) => (
                <TableRow key={listing.id}>
                  <TableCell>
                    <a className="hover:underline" href={listing.url} rel="noreferrer" target="_blank">
                      {listing.source}
                    </a>
                  </TableCell>
                  <TableCell className="capitalize">{displayTypeLabel(listing.property_type) ?? "—"}</TableCell>
                  <TableCell>{listing.street ?? "—"}</TableCell>
                  <TableCell className="text-right">{listing.sqm ?? "—"}</TableCell>
                  <TableCell className="text-right">{listing.ext_sqm ?? "—"}</TableCell>
                  <TableCell className="text-right">{eur(listing.price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!listings.length ? (
            <p className="text-muted-foreground mt-4 text-sm">No active listings for this locality yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
