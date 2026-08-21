import { SetupBanner } from "@/components/setup-banner";
import { getCachedLocalities } from "@/lib/cached-data";
import { supabaseConfigured } from "@/lib/supabase/server";
import { ValuationForm } from "./form";

export default async function ValuationPage() {
  const localities = await getCachedLocalities();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">What is it worth?</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          Comparable listings in the same locality and type, ±20% internal floor area. Optional
          external area, finish, garage, pool, lift, and bedrooms are used when at least five comps
          match; otherwise they are ignored. Street-level if five comps match, else locality, then
          district.
        </p>
      </div>
      {!supabaseConfigured() ? <SetupBanner /> : null}
      <ValuationForm localities={localities} />
    </div>
  );
}
