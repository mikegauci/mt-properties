import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { eur, pct } from "@/lib/format";
import type { AskingStats } from "@/lib/data";

export function PeriodCompare({
  current,
  previous,
  windowLabel,
}: {
  current: AskingStats;
  previous: AskingStats;
  windowLabel: string;
}) {
  const priceChange =
    current.medianPrice && previous.medianPrice
      ? ((current.medianPrice - previous.medianPrice) / previous.medianPrice) * 100
      : null;
  const sqmChange =
    current.medianPerSqm && previous.medianPerSqm
      ? ((current.medianPerSqm - previous.medianPerSqm) / previous.medianPerSqm) * 100
      : null;
  const thin = current.sample < 8 || previous.sample < 8;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asking prices: {windowLabel}</CardTitle>
        <CardDescription>
          Median asking price from agency listings. This is not the NSO sold-price series.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Stat label="Current median" value={eur(current.medianPrice)} sample={current.sample} />
        <Stat label="Previous median" value={eur(previous.medianPrice)} sample={previous.sample} />
        <Stat label="Current €/m²" value={eur(current.medianPerSqm)} sample={current.sample} />
        <Stat label="Change in median" value={pct(priceChange)} />
        <Stat label="Change in €/m²" value={pct(sqmChange)} />
        {thin ? (
          <div className="sm:col-span-2">
            <Badge variant="secondary">Low sample</Badge>
            <p className="text-muted-foreground mt-2 text-sm">
              Thin localities (or a scraper that has only just started) should not be read as a precise
              market move. History begins on the first scrape, not 10 years ago.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sample }: { label: string; value: string; sample?: number }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-medium">{value}</p>
      {sample != null ? <p className="text-muted-foreground text-xs">{sample} listings</p> : null}
    </div>
  );
}
