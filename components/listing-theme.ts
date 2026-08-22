export const SOURCE_THEME: Record<
  string,
  { label: string; card: string; value: string; badge: string; badgeActive: string }
> = {
  remax: {
    label: "RE/MAX",
    card: "bg-rose-50/90 ring-rose-200/70",
    value: "text-rose-800",
    badge: "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200 hover:bg-rose-100",
    badgeActive: "bg-rose-600 text-white ring-1 ring-inset ring-rose-600 hover:bg-rose-700",
  },
  propertymarket: {
    label: "Property Market",
    card: "bg-sky-50/90 ring-sky-200/70",
    value: "text-sky-800",
    badge: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200 hover:bg-sky-100",
    badgeActive: "bg-sky-700 text-white ring-1 ring-inset ring-sky-700 hover:bg-sky-800",
  },
  zanzi: {
    label: "Zanzi",
    card: "bg-emerald-50/90 ring-emerald-200/70",
    value: "text-emerald-800",
    badge: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100",
    badgeActive: "bg-emerald-700 text-white ring-1 ring-inset ring-emerald-700 hover:bg-emerald-800",
  },
  facebook: {
    label: "Facebook Marketplace",
    card: "bg-indigo-50/90 ring-indigo-200/70",
    value: "text-indigo-800",
    badge: "bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100",
    badgeActive: "bg-indigo-700 text-white ring-1 ring-inset ring-indigo-700 hover:bg-indigo-800",
  },
};

const FALLBACK_SOURCE = {
  card: "bg-slate-50/90 ring-slate-200/70",
  value: "text-slate-800",
  badge: "bg-slate-50 text-slate-800 ring-1 ring-inset ring-slate-200 hover:bg-slate-100",
  badgeActive: "bg-slate-700 text-white ring-1 ring-inset ring-slate-700 hover:bg-slate-800",
};

export function sourceTheme(source: string) {
  const known = SOURCE_THEME[source];
  if (known) return known;
  return { ...FALLBACK_SOURCE, label: source };
}

const TYPE_BADGE: Record<string, string> = {
  apartment: "bg-sky-100 text-sky-800",
  maisonette: "bg-teal-100 text-teal-800",
  penthouse: "bg-violet-100 text-violet-800",
  villa: "bg-amber-100 text-amber-900",
  townhouse: "bg-orange-100 text-orange-800",
  terraced_house: "bg-lime-100 text-lime-800",
  house_of_character: "bg-rose-100 text-rose-800",
  farmhouse: "bg-emerald-100 text-emerald-800",
  bungalow: "bg-cyan-100 text-cyan-800",
  palazzo: "bg-fuchsia-100 text-fuchsia-800",
};

export function typeBadgeClass(type: string | null | undefined) {
  if (!type) return "bg-slate-100 text-slate-600";
  return TYPE_BADGE[type] ?? "bg-slate-100 text-slate-700";
}
