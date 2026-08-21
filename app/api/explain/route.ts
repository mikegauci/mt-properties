import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const bodySchema = z.object({
  locality: z.string(),
  propertyType: z.string(),
  sqm: z.number(),
  extSqm: z.number().nullable().optional(),
  finish: z.string().nullable().optional(),
  hasGarage: z.boolean().optional(),
  hasPool: z.boolean().optional(),
  hasLift: z.boolean().optional(),
  result: z.object({
    estimate: z.number().nullable(),
    low: z.number().nullable(),
    high: z.number().nullable(),
    medianPerSqm: z.number().nullable(),
    sample: z.number(),
    confidence: z.string(),
    widened: z.boolean(),
    streetUsed: z.boolean(),
    finishUsed: z.boolean().optional(),
    garageUsed: z.boolean().optional(),
    poolUsed: z.boolean().optional(),
    liftUsed: z.boolean().optional(),
    bedsUsed: z.boolean().optional(),
    extSqmUsed: z.boolean().optional(),
    comps: z.array(
      z.object({
        source: z.string(),
        street: z.string().nullable(),
        sqm: z.number().nullable(),
        ext_sqm: z.number().nullable().optional(),
        price: z.number().nullable(),
        finish: z.string().nullable().optional(),
        has_garage: z.boolean().nullable().optional(),
        has_pool: z.boolean().nullable().optional(),
        has_lift: z.boolean().nullable().optional(),
      }),
    ),
  }),
});

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. The estimate still comes from comps, not from GPT." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You explain a Malta property comps valuation in 2-4 short sentences. Never invent a different price. Use only the numbers given. Mention sample size, whether the search was widened to the district, and which optional filters (street, external area, finish, garage, pool, lift, bedrooms) were actually applied.",
      },
      {
        role: "user",
        content: JSON.stringify(parsed.data),
      },
    ],
  });

  return NextResponse.json({
    explanation: completion.choices[0]?.message?.content ?? "",
  });
}
