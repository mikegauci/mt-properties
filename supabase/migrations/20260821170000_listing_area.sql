alter table public.listings
  add column if not exists area text;

create index if not exists listings_locality_area_active_idx
  on public.listings (locality_id, area)
  where is_active and area is not null;
