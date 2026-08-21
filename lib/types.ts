export type Locality = {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string;
  district: string;
  island: "malta" | "gozo";
};

export type PriceIndexPoint = {
  period: string;
  index_value: number;
  yoy_pct: number | null;
  source: string;
  series: string;
};

export type TransactionRow = {
  period: string;
  period_type: string;
  geography_type: string;
  district: string | null;
  locality_id: string | null;
  deeds: number | null;
  promise_of_sale: number | null;
  total_value: number | null;
};

export type ListingRow = {
  id: string;
  source: string;
  external_id: string;
  url: string;
  locality_id: string | null;
  street: string | null;
  area: string | null;
  property_type: string | null;
  beds: number | null;
  sqm: number | null;
  ext_sqm: number | null;
  price: number | null;
  title: string | null;
  image_url: string | null;
  finish: Finish | null;
  has_garage: boolean | null;
  has_pool: boolean | null;
  has_lift: boolean | null;
  first_seen: string;
  last_seen: string;
  is_active: boolean;
  fingerprint: string | null;
};

export type ScrapeRun = {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  listings_upserted: number;
  listings_inactivated: number;
  error: string | null;
  status: "running" | "ok" | "error";
};

export const PROPERTY_TYPES = [
  "apartment",
  "maisonette",
  "penthouse",
  "terraced_house",
  "townhouse",
  "villa",
  "house_of_character",
  "farmhouse",
  "bungalow",
  "palazzo",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

const SKIP_TYPE = /garage|car_space|land|airspace|plot|office|shop|warehouse|commercial/;

export function canonicalPropertyType(raw: string | null | undefined): PropertyType | null {
  if (!raw) return null;
  const key = raw.toLowerCase().replaceAll(" ", "_");
  if (SKIP_TYPE.test(key)) return null;
  if (key === "studio_flat" || key.startsWith("apartment")) return "apartment";
  if (key.startsWith("maisonette")) return "maisonette";
  if (key.startsWith("penthouse")) return "penthouse";
  if (key.startsWith("villa")) return "villa";
  if (key.startsWith("bungalow")) return "bungalow";
  if (key.startsWith("palazz")) return "palazzo";
  if (key.startsWith("townhouse") || key === "town_house") return "townhouse";
  if (key.startsWith("terraced")) return "terraced_house";
  if (key.includes("character")) return "house_of_character";
  if (key.startsWith("farmhouse")) return "farmhouse";
  if ((PROPERTY_TYPES as readonly string[]).includes(key)) return key as PropertyType;
  return null;
}

export type TypeAsking = {
  type: PropertyType;
  medianPrice: number;
  sample: number;
};

export const FINISH_TYPES = ["shell", "finished", "partly_furnished", "furnished"] as const;

export type Finish = (typeof FINISH_TYPES)[number];

export const FINISH_LABELS: Record<Finish, string> = {
  shell: "Shell",
  finished: "Finished",
  partly_furnished: "Partly furnished",
  furnished: "Furnished",
};

export type CompsMatchFlags = {
  streetUsed: boolean;
  finishUsed: boolean;
  garageUsed: boolean;
  poolUsed: boolean;
  liftUsed: boolean;
  bedsUsed: boolean;
  extSqmUsed: boolean;
};
