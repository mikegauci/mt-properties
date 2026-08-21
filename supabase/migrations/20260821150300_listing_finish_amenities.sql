alter table public.listings
  add column if not exists finish text,
  add column if not exists has_garage boolean,
  add column if not exists has_pool boolean,
  add column if not exists has_lift boolean;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listings_finish_check'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_finish_check
      check (
        finish is null
        or finish in ('shell', 'finished', 'partly_furnished', 'furnished')
      );
  end if;
end $$;
