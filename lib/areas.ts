import catalog from "@/data/localities.json";

type CatalogRow = {
  slug: string;
  areas?: string[];
};

const bySlug = new Map((catalog as CatalogRow[]).map((row) => [row.slug, row]));

export function foldArea(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[-./,;:()]/g, " ");
  return ascii
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word === "marija" ? "maria" : word === "estates" ? "estate" : word))
    .join(" ");
}

export function areasForSlug(slug: string | null | undefined): string[] {
  if (!slug) return [];
  return [...(bySlug.get(slug)?.areas ?? [])];
}

export function mentionsArea(text: string | null | undefined, areaName: string): boolean {
  if (!text) return false;
  const haystack = ` ${foldArea(text)} `;
  const needle = foldArea(areaName);
  if (!needle) return false;
  return haystack.includes(` ${needle} `);
}

export function listingMatchesArea(
  listing: { area: string | null; title: string | null; street: string | null },
  areaName: string,
): boolean {
  if (listing.area && foldArea(listing.area) === foldArea(areaName)) return true;
  return mentionsArea([listing.title, listing.street].filter(Boolean).join(" "), areaName);
}
