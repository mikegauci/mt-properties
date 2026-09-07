create table public.properties (
  id uuid primary key default gen_random_uuid(),
  locality_id uuid references public.localities(id) on delete set null,
  property_type text,
  beds integer,
  sqm numeric,
  ext_sqm numeric,
  street text,
  area text,
  price_median numeric,
  primary_listing_id uuid,
  match_block text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listings
  add column property_id uuid references public.properties(id) on delete set null,
  add column match_block text;

create index listings_property_id_idx
  on public.listings (property_id)
  where property_id is not null;

create index listings_match_block_idx
  on public.listings (match_block)
  where match_block is not null;

create index properties_match_block_idx
  on public.properties (match_block)
  where match_block is not null;

alter table public.properties enable row level security;

create or replace view public.listings_deduped as
select distinct on (coalesce(l.property_id, l.id)) l.*
from public.listings l
where l.is_active
  and l.price > 0
order by
  coalesce(l.property_id, l.id),
  (case when l.street is not null and trim(l.street) <> '' then 1 else 0 end) desc,
  (case when l.beds is not null then 1 else 0 end) desc,
  (case when l.sqm is not null then 1 else 0 end) desc,
  (case when l.source = 'remax' then 1 else 0 end) desc,
  l.last_seen desc,
  l.id desc;

create or replace function public.listing_source_facets(p_source text default null)
returns table(source text, count bigint)
language sql
stable
as $$
  select l.source, count(distinct coalesce(l.property_id, l.id))::bigint
  from public.listings l
  where l.is_active
    and l.price > 0
    and (p_source is null or p_source = 'all' or l.source = p_source)
  group by l.source
  order by l.source;
$$;

create or replace function public.listing_locality_facets(p_source text default null)
returns table(locality_id uuid, count bigint)
language sql
stable
as $$
  select l.locality_id, count(distinct coalesce(l.property_id, l.id))::bigint
  from public.listings l
  where l.is_active
    and l.price > 0
    and l.locality_id is not null
    and (p_source is null or p_source = 'all' or l.source = p_source)
  group by l.locality_id;
$$;

create or replace function public.listing_property_type_facets(p_source text default null)
returns table(property_type text, count bigint)
language sql
stable
as $$
  select l.property_type, count(distinct coalesce(l.property_id, l.id))::bigint
  from public.listings l
  where l.is_active
    and l.price > 0
    and l.property_type is not null
    and (p_source is null or p_source = 'all' or l.source = p_source)
  group by l.property_type
  order by l.property_type;
$$;

create or replace function public.listing_asking_stats()
returns table(
  sample bigint,
  median_price numeric,
  median_per_sqm numeric,
  p25_per_sqm numeric,
  p75_per_sqm numeric
)
language sql
stable
as $$
  with deduped as (
    select distinct on (coalesce(l.property_id, l.id))
      l.price,
      l.sqm
    from public.listings l
    where l.is_active and l.price > 0
    order by
      coalesce(l.property_id, l.id),
      (case when l.street is not null and trim(l.street) <> '' then 1 else 0 end) desc,
      (case when l.beds is not null then 1 else 0 end) desc,
      (case when l.sqm is not null then 1 else 0 end) desc,
      (case when l.source = 'remax' then 1 else 0 end) desc,
      l.last_seen desc,
      l.id desc
  ),
  priced as (
    select d.price from deduped d where d.price > 0
  ),
  with_sqm as (
    select d.price / d.sqm as per_sqm
    from deduped d
    where d.price > 0 and d.sqm > 10
  )
  select
    (select count(*) from priced),
    (select percentile_cont(0.5) within group (order by price) from priced),
    (select percentile_cont(0.5) within group (order by per_sqm) from with_sqm),
    (select percentile_cont(0.25) within group (order by per_sqm) from with_sqm),
    (select percentile_cont(0.75) within group (order by per_sqm) from with_sqm);
$$;

create or replace function public.listing_source_counts_agg()
returns table(source text, count bigint)
language sql
stable
as $$
  select l.source, count(distinct coalesce(l.property_id, l.id))::bigint
  from public.listings l
  where l.is_active
  group by l.source
  order by l.source;
$$;

create or replace function public.listing_area_counts(p_locality_id uuid, p_source text default null)
returns table(area text, count bigint)
language sql
stable
as $$
  select l.area, count(distinct coalesce(l.property_id, l.id))::bigint
  from public.listings l
  where l.is_active
    and l.price > 0
    and l.locality_id = p_locality_id
    and l.area is not null
    and trim(l.area) <> ''
    and (p_source is null or p_source = 'all' or l.source = p_source)
  group by l.area
  order by l.area;
$$;

create or replace function public.listing_asking_compare_rows()
returns table(
  locality_id uuid,
  property_type text,
  price numeric,
  area text
)
language sql
stable
as $$
  select distinct on (coalesce(l.property_id, l.id))
    l.locality_id,
    l.property_type,
    l.price,
    l.area
  from public.listings l
  where l.is_active and l.price > 0
  order by
    coalesce(l.property_id, l.id),
    (case when l.street is not null and trim(l.street) <> '' then 1 else 0 end) desc,
    (case when l.beds is not null then 1 else 0 end) desc,
    (case when l.sqm is not null then 1 else 0 end) desc,
    (case when l.source = 'remax' then 1 else 0 end) desc,
    l.last_seen desc,
    l.id desc;
$$;

create or replace function public.listing_sibling_sources(p_property_ids uuid[])
returns table(property_id uuid, sources text[])
language sql
stable
as $$
  select l.property_id, array_agg(distinct l.source order by l.source)
  from public.listings l
  where l.property_id = any(p_property_ids)
    and l.is_active
  group by l.property_id;
$$;
