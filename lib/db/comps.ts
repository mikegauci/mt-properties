import { supabaseAdmin } from "@/lib/supabase/server";
import { LISTING_COLUMNS } from "@/lib/db/listings";
import type { CompsMatchFlags, Finish, ListingRow } from "@/lib/types";

const MIN_COMPS = 5;

const UNUSED_FLAGS: CompsMatchFlags = {
  streetUsed: false,
  finishUsed: false,
  garageUsed: false,
  poolUsed: false,
  liftUsed: false,
  bedsUsed: false,
  extSqmUsed: false,
};

export async function getComps(input: {
  localityId: string;
  district: string;
  propertyType: string;
  sqm: number;
  street?: string;
  beds?: number;
  finish?: Finish;
  hasGarage?: boolean;
  hasPool?: boolean;
  hasLift?: boolean;
  extSqm?: number;
}): Promise<{ comps: ListingRow[]; widened: boolean } & CompsMatchFlags> {
  const supabase = supabaseAdmin();
  if (!supabase) return { comps: [], widened: false, ...UNUSED_FLAGS };

  const low = input.sqm * 0.8;
  const high = input.sqm * 1.2;
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("property_type", input.propertyType)
    .eq("locality_id", input.localityId)
    .gt("price", 0)
    .gte("sqm", low)
    .lte("sqm", high)
    .or(`is_active.eq.true,last_seen.gte."${since}"`)
    .limit(200);
  if (error) throw error;

  const locality = refineComps((data ?? []) as ListingRow[], input);
  if (locality.comps.length >= MIN_COMPS) return { ...locality, widened: false };

  const { data: districtLocalities, error: locError } = await supabase
    .from("localities")
    .select("id")
    .eq("district", input.district);
  if (locError) throw locError;
  const ids = (districtLocalities ?? []).map((row) => row.id);
  const { data: wide, error: wideError } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("property_type", input.propertyType)
    .in("locality_id", ids)
    .gt("price", 0)
    .gte("sqm", low)
    .lte("sqm", high)
    .or(`is_active.eq.true,last_seen.gte."${since}"`)
    .limit(200);
  if (wideError) throw wideError;
  const district = refineComps((wide ?? []) as ListingRow[], { ...input, street: undefined });
  return { ...district, widened: true, streetUsed: false };
}

function refineComps(
  rows: ListingRow[],
  input: {
    street?: string;
    beds?: number;
    finish?: Finish;
    hasGarage?: boolean;
    hasPool?: boolean;
    hasLift?: boolean;
    extSqm?: number;
  },
): { comps: ListingRow[] } & CompsMatchFlags {
  let comps = rows;
  const flags: CompsMatchFlags = { ...UNUSED_FLAGS };

  const street = input.street?.trim().toLowerCase();
  if (street) {
    const streetComps = comps.filter(
      (row) => row.street && row.street.toLowerCase().includes(street),
    );
    if (streetComps.length >= MIN_COMPS) {
      comps = streetComps;
      flags.streetUsed = true;
    }
  }

  if (input.extSqm && input.extSqm > 0) {
    const low = input.extSqm * 0.8;
    const high = input.extSqm * 1.2;
    const next = comps.filter(
      (row) => row.ext_sqm != null && row.ext_sqm >= low && row.ext_sqm <= high,
    );
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.extSqmUsed = true;
    }
  }

  if (input.finish) {
    const next = comps.filter((row) => row.finish === input.finish);
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.finishUsed = true;
    }
  }
  if (input.hasGarage) {
    const next = comps.filter((row) => row.has_garage === true);
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.garageUsed = true;
    }
  }
  if (input.hasPool) {
    const next = comps.filter((row) => row.has_pool === true);
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.poolUsed = true;
    }
  }
  if (input.hasLift) {
    const next = comps.filter((row) => row.has_lift === true);
    if (next.length >= MIN_COMPS) {
      comps = next;
      flags.liftUsed = true;
    }
  }
  if (input.beds != null) {
    const beds = input.beds;
    const exact = comps.filter((row) => row.beds === beds);
    if (exact.length >= MIN_COMPS) {
      comps = exact;
      flags.bedsUsed = true;
    } else {
      const near = comps.filter((row) => row.beds != null && Math.abs(row.beds - beds) <= 1);
      if (near.length >= MIN_COMPS) {
        comps = near;
        flags.bedsUsed = true;
      }
    }
  }

  return { comps, ...flags };
}
