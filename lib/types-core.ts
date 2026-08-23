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
