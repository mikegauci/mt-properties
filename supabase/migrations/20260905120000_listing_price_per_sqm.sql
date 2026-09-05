alter table public.listings
  add column if not exists price_per_sqm double precision
  generated always as (
    case
      when sqm is not null and sqm > 10 and price is not null and price > 0
        then price::double precision / sqm
      else null
    end
  ) stored;

create index if not exists listings_active_price_per_sqm_idx
  on public.listings (price_per_sqm)
  where is_active = true and price > 0;

create index if not exists listings_active_locality_last_seen_idx
  on public.listings (locality_id, last_seen desc, id desc)
  where is_active = true and price > 0;
