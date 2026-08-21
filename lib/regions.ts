import type { Locality } from "@/lib/types";

export const REGIONS = ["north", "south", "central", "gozo"] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_LABELS: Record<Region, string> = {
  north: "North",
  south: "South",
  central: "Central",
  gozo: "Gozo",
};

const DISTRICT_REGION: Record<string, Region> = {
  Northern: "north",
  "Northern Harbour": "north",
  "Southern Harbour": "south",
  "South Eastern": "south",
  Western: "central",
  Gozo: "gozo",
  "Gozo and Comino": "gozo",
};

export function localityRegion(locality: Pick<Locality, "district" | "island">): Region {
  if (locality.island === "gozo") return "gozo";
  return DISTRICT_REGION[locality.district] ?? "central";
}
