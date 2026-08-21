import { NextResponse } from "next/server";
import { z } from "zod";
import { getComps, getLocality, getPriceIndex } from "@/lib/data";
import { forecastFromIndex } from "@/lib/forecast";
import { FINISH_TYPES, PROPERTY_TYPES } from "@/lib/types";
import { valueFromComps } from "@/lib/valuation";

const bodySchema = z.object({
  localitySlug: z.string().min(1),
  propertyType: z.enum(PROPERTY_TYPES),
  sqm: z.number().min(10).max(5000),
  extSqm: z.number().min(0).max(20000).optional(),
  beds: z.number().int().min(0).max(20).optional(),
  street: z.string().max(120).optional(),
  finish: z.enum(FINISH_TYPES).optional(),
  hasGarage: z.boolean().optional(),
  hasPool: z.boolean().optional(),
  hasLift: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const locality = await getLocality(parsed.data.localitySlug);
  if (!locality) {
    return NextResponse.json({ error: "Unknown locality" }, { status: 404 });
  }

  const { comps, widened, ...flags } = await getComps({
    localityId: locality.id,
    district: locality.district,
    propertyType: parsed.data.propertyType,
    sqm: parsed.data.sqm,
    extSqm: parsed.data.extSqm,
    street: parsed.data.street,
    beds: parsed.data.beds,
    finish: parsed.data.finish,
    hasGarage: parsed.data.hasGarage,
    hasPool: parsed.data.hasPool,
    hasLift: parsed.data.hasLift,
  });

  const valuation = valueFromComps(parsed.data.sqm, comps, widened, flags);
  const index = await getPriceIndex();
  const forecast = forecastFromIndex(valuation.estimate, index);

  return NextResponse.json({
    ...valuation,
    forecast,
    locality,
  });
}
