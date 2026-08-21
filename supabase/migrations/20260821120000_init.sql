create extension if not exists pgcrypto;

create table if not exists public.localities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_mt text not null,
  district text not null,
  island text not null check (island in ('malta', 'gozo')),
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.nso_transactions (
  id uuid primary key default gen_random_uuid(),
  period date not null,
  period_type text not null check (period_type in ('month', 'quarter', 'year')),
  geography_type text not null check (geography_type in ('national', 'district', 'locality')),
  district text,
  locality_id uuid references public.localities (id) on delete cascade,
  deeds integer,
  promise_of_sale integer,
  total_value numeric,
  created_at timestamptz not null default now()
);

create unique index if not exists nso_transactions_national_uniq
  on public.nso_transactions (period, period_type)
  where geography_type = 'national';

create unique index if not exists nso_transactions_district_uniq
  on public.nso_transactions (period, period_type, district)
  where geography_type = 'district';

create unique index if not exists nso_transactions_locality_uniq
  on public.nso_transactions (period, period_type, locality_id)
  where geography_type = 'locality';

create table if not exists public.price_indexes (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('nso_rppi', 'cbm')),
  series text not null check (series in ('overall', 'apartments', 'maisonettes')),
  period date not null,
  index_value numeric not null,
  yoy_pct numeric,
  created_at timestamptz not null default now(),
  unique (source, series, period)
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  url text not null,
  locality_id uuid references public.localities (id) on delete set null,
  street text,
  property_type text,
  beds integer,
  sqm numeric,
  price numeric,
  title text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  is_active boolean not null default true,
  fingerprint text,
  raw jsonb,
  unique (source, external_id)
);

create index if not exists listings_locality_active_idx
  on public.listings (locality_id, is_active, property_type);

create index if not exists listings_fingerprint_idx
  on public.listings (fingerprint)
  where fingerprint is not null;

create index if not exists listings_source_active_idx
  on public.listings (source, is_active);

create table if not exists public.listing_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  price numeric not null,
  observed_at timestamptz not null default now()
);

create index if not exists listing_price_snapshots_listing_idx
  on public.listing_price_snapshots (listing_id, observed_at desc);

create table if not exists public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  listings_upserted integer not null default 0,
  listings_inactivated integer not null default 0,
  error text,
  status text not null default 'running' check (status in ('running', 'ok', 'error'))
);

create index if not exists scrape_runs_source_started_idx
  on public.scrape_runs (source, started_at desc);

alter table public.localities enable row level security;
alter table public.nso_transactions enable row level security;
alter table public.price_indexes enable row level security;
alter table public.listings enable row level security;
alter table public.listing_price_snapshots enable row level security;
alter table public.scrape_runs enable row level security;
