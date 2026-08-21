"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { eur, pct, typeLabel } from "@/lib/format";
import { FINISH_LABELS, FINISH_TYPES, PROPERTY_TYPES, type CompsMatchFlags, type Finish, type Locality } from "@/lib/types";

type ApiResult = {
  estimate: number | null;
  low: number | null;
  high: number | null;
  medianPerSqm: number | null;
  sample: number;
  confidence: "high" | "medium" | "low";
  widened: boolean;
  streetUsed: boolean;
  finishUsed: boolean;
  garageUsed: boolean;
  poolUsed: boolean;
  liftUsed: boolean;
  bedsUsed: boolean;
  extSqmUsed: boolean;
  forecast: {
    yoyPct: number | null;
    twelveMonth: number | null;
    method: string;
    caveat: string;
  };
  comps: {
    id: string;
    source: string;
    url: string;
    street: string | null;
    property_type: string | null;
    beds: number | null;
    sqm: number | null;
    ext_sqm: number | null;
    price: number | null;
    finish: Finish | null;
    has_garage: boolean | null;
    has_pool: boolean | null;
    has_lift: boolean | null;
  }[];
};

const MATCH_BADGES: { key: keyof CompsMatchFlags; label: string }[] = [
  { key: "streetUsed", label: "Street comps" },
  { key: "finishUsed", label: "Finish comps" },
  { key: "garageUsed", label: "Garage comps" },
  { key: "poolUsed", label: "Pool comps" },
  { key: "liftUsed", label: "Lift comps" },
  { key: "bedsUsed", label: "Bedroom comps" },
  { key: "extSqmUsed", label: "External area comps" },
];

export function ValuationForm({ localities }: { localities: Locality[] }) {
  const [localitySlug, setLocalitySlug] = useState(localities[0]?.slug ?? "");
  const [propertyType, setPropertyType] = useState("apartment");
  const [sqm, setSqm] = useState("85");
  const [extSqm, setExtSqm] = useState("");
  const [beds, setBeds] = useState("2");
  const [street, setStreet] = useState("");
  const [finish, setFinish] = useState("");
  const [hasGarage, setHasGarage] = useState(false);
  const [hasPool, setHasPool] = useState(false);
  const [hasLift, setHasLift] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  const selected = useMemo(
    () => localities.find((row) => row.slug === localitySlug),
    [localities, localitySlug],
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setExplanation(null);
    try {
      const response = await fetch("/api/valuate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          localitySlug,
          propertyType,
          sqm: Number(sqm),
          extSqm: extSqm ? Number(extSqm) : undefined,
          beds: beds ? Number(beds) : undefined,
          street: street || undefined,
          finish: finish || undefined,
          hasGarage: hasGarage || undefined,
          hasPool: hasPool || undefined,
          hasLift: hasLift || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Valuation failed");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Valuation failed");
    } finally {
      setLoading(false);
    }
  }

  async function explain() {
    if (!result) return;
    setLoading(true);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locality: selected?.name_en,
          propertyType,
          sqm: Number(sqm),
          extSqm: extSqm ? Number(extSqm) : null,
          finish: finish || null,
          hasGarage,
          hasPool,
          hasLift,
          result,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not explain");
      setExplanation(payload.explanation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not explain");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Subject property</CardTitle>
          <CardDescription>
            Estimate is median comparable €/m² × your internal floor area. OpenAI never sets the
            number.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field label="Locality">
              <select
                className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
                value={localitySlug}
                onChange={(event) => setLocalitySlug(event.target.value)}
              >
                {localities.map((row) => (
                  <option key={row.slug} value={row.slug}>
                    {row.name_en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select
                className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
                value={propertyType}
                onChange={(event) => setPropertyType(event.target.value)}
              >
                {PROPERTY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {typeLabel(type)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Internal area (m²)">
              <Input type="number" min={10} value={sqm} onChange={(event) => setSqm(event.target.value)} />
            </Field>
            <Field label="External area (m², optional)">
              <Input
                type="number"
                min={0}
                value={extSqm}
                onChange={(event) => setExtSqm(event.target.value)}
                placeholder="Terrace, yard, pool deck"
              />
            </Field>
            <Field label="Bedrooms">
              <Input type="number" min={0} value={beds} onChange={(event) => setBeds(event.target.value)} />
            </Field>
            <Field label="Street (optional)">
              <Input
                value={street}
                onChange={(event) => setStreet(event.target.value)}
                placeholder="Used if 5+ comps match"
              />
            </Field>
            <Field label="Finish (optional)">
              <select
                className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
                value={finish}
                onChange={(event) => setFinish(event.target.value)}
              >
                <option value="">Any</option>
                {FINISH_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {FINISH_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset className="space-y-2">
              <Label>Amenities (optional)</Label>
              <p className="text-muted-foreground text-xs">Used if 5+ comps match</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-foreground size-4"
                  checked={hasGarage}
                  onChange={(event) => setHasGarage(event.target.checked)}
                />
                Garage / parking
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-foreground size-4"
                  checked={hasPool}
                  onChange={(event) => setHasPool(event.target.checked)}
                />
                Pool
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-foreground size-4"
                  checked={hasLift}
                  onChange={(event) => setHasLift(event.target.checked)}
                />
                Lift
              </label>
            </fieldset>
            <Button disabled={loading || !localities.length} type="submit">
              {loading ? "Working…" : "Estimate"}
            </Button>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {result ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{eur(result.estimate)}</CardTitle>
                  <Badge variant="secondary">{result.confidence} confidence</Badge>
                  {result.widened ? <Badge variant="outline">Widened to district</Badge> : null}
                  {MATCH_BADGES.map((badge) =>
                    result[badge.key] ? <Badge key={badge.key}>{badge.label}</Badge> : null,
                  )}
                </div>
                <CardDescription>
                  Range {eur(result.low)} – {eur(result.high)} · {result.sample} comps · median{" "}
                  {eur(result.medianPerSqm)} / m²
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  +12 month indicative: <strong>{eur(result.forecast.twelveMonth)}</strong>{" "}
                  ({pct(result.forecast.yoyPct)} official index)
                </p>
                <p className="text-muted-foreground">{result.forecast.method}</p>
                <p className="text-muted-foreground">{result.forecast.caveat}</p>
                <Button type="button" variant="outline" onClick={explain} disabled={loading}>
                  Explain with OpenAI
                </Button>
                {explanation ? <p className="leading-6">{explanation}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Comparables</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Street</TableHead>
                      <TableHead>Finish</TableHead>
                      <TableHead>Amenities</TableHead>
                      <TableHead className="text-right">Int. m²</TableHead>
                      <TableHead className="text-right">Ext. m²</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.comps.map((comp) => (
                      <TableRow key={comp.id}>
                        <TableCell>
                          <a className="hover:underline" href={comp.url} rel="noreferrer" target="_blank">
                            {comp.source}
                          </a>
                        </TableCell>
                        <TableCell>{comp.street ?? "—"}</TableCell>
                        <TableCell>{finishLabel(comp.finish)}</TableCell>
                        <TableCell>{amenitySummary(comp)}</TableCell>
                        <TableCell className="text-right">{comp.sqm ?? "—"}</TableCell>
                        <TableCell className="text-right">{comp.ext_sqm ?? "—"}</TableCell>
                        <TableCell className="text-right">{eur(comp.price)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-sm">
              Run an estimate after listings have been scraped. Until then the comps set will be empty.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function finishLabel(value: Finish | null) {
  if (!value) return "—";
  return FINISH_LABELS[value] ?? typeLabel(value);
}

function amenitySummary(row: {
  has_garage: boolean | null;
  has_pool: boolean | null;
  has_lift: boolean | null;
}) {
  const parts = [
    row.has_garage ? "garage" : null,
    row.has_pool ? "pool" : null,
    row.has_lift ? "lift" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
