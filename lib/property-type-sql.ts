import propertyTypeConfig from "@/data/property-types.json";
import { PROPERTY_TYPES, type PropertyType } from "@/lib/types-core";

const skipPattern = new RegExp(
  propertyTypeConfig.skipTypes.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

function escapeFilterValue(value: string) {
  return value.replace(/[%_]/g, "");
}

function postgrestFilterValue(value: string) {
  const escaped = escapeFilterValue(value);
  if (/[\s,]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

export function propertyTypeOrFilter(canonical: string): string {
  const parts = new Set<string>();
  parts.add(`property_type.eq.${postgrestFilterValue(canonical)}`);

  for (const [alias, type] of Object.entries(propertyTypeConfig.aliases)) {
    if (type !== canonical) continue;
    const underscored = alias.toLowerCase().replaceAll(" ", "_");
    parts.add(`property_type.eq.${postgrestFilterValue(underscored)}`);
    if (alias.includes(" ")) {
      parts.add(`property_type.eq.${postgrestFilterValue(alias.toLowerCase())}`);
    }
  }

  for (const rule of propertyTypeConfig.prefixRules) {
    if (rule.type !== canonical) continue;
    parts.add(`property_type.ilike.${postgrestFilterValue(rule.prefix)}*`);
  }

  if (canonical === "house_of_character") {
    parts.add("property_type.ilike.*character*");
  }

  return [...parts].join(",");
}

export function isSkippedPropertyType(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const spaced = raw.toLowerCase().trim();
  const underscored = spaced.replaceAll(" ", "_");
  return skipPattern.test(spaced) || skipPattern.test(underscored);
}

export function isKnownPropertyType(canonical: string): canonical is PropertyType {
  return (PROPERTY_TYPES as readonly string[]).includes(canonical);
}
