create or replace function public.listing_source_facets(p_source text default null)
returns table(source text, count bigint)
language sql
stable
as $$
  select l.source, count(*)::bigint
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
  select l.locality_id, count(*)::bigint
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
  select l.property_type, count(*)::bigint
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
  with priced as (
    select l.price
    from public.listings l
    where l.is_active and l.price > 0
  ),
  with_sqm as (
    select l.price / l.sqm as per_sqm
    from public.listings l
    where l.is_active and l.price > 0 and l.sqm > 10
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
  select l.source, count(*)::bigint
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
  select l.area, count(*)::bigint
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
  select l.locality_id, l.property_type, l.price, l.area
  from public.listings l
  where l.is_active and l.price > 0;
$$;
