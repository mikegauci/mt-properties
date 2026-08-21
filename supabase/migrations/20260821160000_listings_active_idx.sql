create index if not exists listings_active_last_seen_idx
  on public.listings (is_active, last_seen desc, id desc)
  where is_active = true and price > 0;
