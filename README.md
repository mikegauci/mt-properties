# MT Properties

Personal Malta property intelligence: official sold-price indexes plus asking prices from agency listing feeds.

## What the numbers mean

- **House price index** — NSO series published via Eurostat (`prc_hpi_q`, 2015 = 100). National only. This is the sold-price change.
- **NSO transactions** — deed counts. Declared sale totals exist nationally; **NSO does not publish declared values by locality**.
- **Asking prices** — RE/MAX Malta, PropertyMarket.com.mt, and Zanzi Homes public listings, scraped daily. Locality €/m² and valuations come from this. History starts on the first successful scrape.

Facebook Marketplace is out of scope.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase Postgres (service-role access from the server only; RLS enabled with no anon policies)
- Python scraper (`scraper/mtprop`)

## Setup

1. Create a Supabase project.
2. Run [`supabase/migrations/20260821120000_init.sql`](supabase/migrations/20260821120000_init.sql) in the SQL editor (or `supabase db push` after `supabase link`).
3. Copy `.env.example` to `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Install and seed:

```bash
npm install
pip3 install -r scraper/requirements.txt
PYTHONPATH=scraper python3 -m mtprop seed
npm run dev
```

5. Open the app:

```bash
npm run dev
```

## Local runs

All scraper commands write straight to Supabase. Refresh [mt-properties.vercel.app](https://mt-properties.vercel.app/listings) after a run — no redeploy needed for data changes.

### One-time / reference data

```bash
npm run ingest
```

Seeds localities, NSO transactions, and the Eurostat house-price index. Re-run to refresh official series:

```bash
PYTHONPATH=scraper python3 -m mtprop nso
```

### Scrape listings

All sources:

```bash
npm run scrape
```

Single source:

```bash
npm run scrape:propertymarket
npm run scrape:zanzi
PYTHONPATH=scraper python3 -m mtprop agencies --source remax
```

Short test (first page only):

```bash
SCRAPE_MAX_PAGES=1 npm run scrape:propertymarket
```

Verbose logging (or set `SCRAPE_VERBOSE=1` in `.env`):

```bash
SCRAPE_VERBOSE=1 npm run scrape:propertymarket
```

Listings save in batches as the scrape runs. Ctrl+C keeps whatever was already flushed; only the end-of-run inactivation step is skipped.

### Backfill thumbnails

Fill missing `image_url` values for listings already in the database:

```bash
npm run scrape:images
```

Property Market only, with more parallel fetches:

```bash
PYTHONPATH=scraper python3 -m mtprop backfill-images --source propertymarket --workers 20
```

Optional `.env` tuning: `IMAGE_BACKFILL_WORKERS` (default 12), `IMAGE_BACKFILL_DELAY_SECONDS` (default 0).

### Backfill areas

Set `listings.area` from stored Town/Zone/title text:

```bash
PYTHONPATH=scraper python3 -m mtprop backfill-areas
```

### Optional scrape tuning

In `.env`:

- `SCRAPE_DELAY_SECONDS` — pause between listing pages (default 0.1)
- `SCRAPE_MAX_PAGES` — cap pages per source (omit for a full run)
- `SCRAPE_VERBOSE=1` — log every listing

## Daily updates

GitHub Actions:

- `.github/workflows/daily-scrape.yml` — 03:00 UTC
- `.github/workflows/weekly-nso.yml` — Mondays 06:00 UTC

Repository secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Valuation

Median comparable €/m² × subject floor area, ±20% size, same type. Street-level if at least five comps match. Otherwise locality, then district with a low-confidence flag.

The +12 month figure applies the latest official index YoY to that comps estimate. It is indicative, not a survey.

Optional `OPENAI_API_KEY` writes a short explanation of those comps. It does not set the price.
