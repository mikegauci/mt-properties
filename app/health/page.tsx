import { SetupBanner } from "@/components/setup-banner";
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
import { getCachedLatestScrapeRuns, getCachedListingCounts } from "@/lib/cached-data";
import { supabaseConfigured } from "@/lib/supabase/server";

export default async function HealthPage() {
  const configured = supabaseConfigured();
  const [runs, counts] = configured
    ? await Promise.all([getCachedLatestScrapeRuns(), getCachedListingCounts()])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Daily agency scrape at 03:00 UTC plus a weekly NSO/Eurostat refresh.
        </p>
      </div>
      {!configured ? <SetupBanner /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {["remax", "propertymarket", "zanzi"].map((source) => {
          const count = counts.find((row) => row.source === source)?.count ?? 0;
          return (
            <Card key={source}>
              <CardHeader>
                <CardDescription>{source}</CardDescription>
                <CardTitle>{count} active</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Latest agency scrape runs.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Upserted</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{new Date(run.started_at).toLocaleString("en-MT")}</TableCell>
                  <TableCell>{run.source}</TableCell>
                  <TableCell>
                    <Badge variant={run.status === "ok" ? "secondary" : run.status === "error" ? "destructive" : "outline"}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{run.listings_upserted}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs">{run.error ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
