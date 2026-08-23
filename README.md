# MT Properties

Personal Malta property intelligence: official sold-price indexes plus asking prices from agency listing feeds.

## What the numbers mean

- **House price index** — NSO series published via Eurostat (`prc_hpi_q`, 2015 = 100). National only. This is the sold-price change.
- **NSO transactions** — deed counts. Declared sale totals exist nationally; **NSO does not publish declared values by locality**.
- **Asking prices** — RE/MAX Malta, PropertyMarket.com.mt, Zanzi Homes, and Facebook Marketplace property-for-sale listings (last 30 days via Apify). Locality €/m² and valuations come from agency feeds; Facebook adds informal owner/agent posts. History starts on the first successful scrape.

Facebook Marketplace runs through [Apify](https://apify.com/) and needs `APIFY_API_TOKEN`. Expect lower field completeness (beds, sqm, locality) than agency feeds.

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
npm run scrape:facebook
PYTHONPATH=scraper python3 -m mtprop agencies --source remax
```

Facebook Marketplace uses two scrape profiles (set `APIFY_FB_PROFILE`):

| Profile | When (CI) | Scope | Pages | Window |
|---|---|---|---|---|
| `weekly` | Sundays | All Malta (Valletta hub URL) | 50 | 30 days |
| `daily-north` | Mon–Sat | Mellieha + St Paul's Bay | 5 each | 7 days |

Daily north runs are **partial** — they upsert new listings but do **not** inactivate Facebook listings elsewhere in Malta (the weekly run handles that).

```bash
npm run scrape:facebook:weekly
npm run scrape:facebook:daily
```

**Cursor + Apify MCP:** [`.cursor/mcp.json`](.cursor/mcp.json) connects this repo to Apify (OAuth). From chat you can search actors, run `curious_coder/facebook-marketplace`, and inspect results without pasting a token here. The Python scraper and GitHub Actions still need `APIFY_API_TOKEN` in `.env` / repo secrets.

### Apify API token (local + CI)

MCP OAuth covers chat only. For `npm run scrape:facebook` and daily GitHub Actions:

1. Open [Apify → Integrations](https://console.apify.com/account/integrations) → **Personal API tokens** → **Create token**.
2. Add to `.env` (do not commit):
   ```bash
   APIFY_API_TOKEN=apify_api_...
   ```
3. Add the same value as a GitHub repo secret:
   ```bash
   gh secret set APIFY_API_TOKEN
   ```
   Paste the token when prompted.

Default weekly scrape uses Valletta-area property-for-sale (`110612325626836/propertyforsale`). Override with `APIFY_FB_URL` or `APIFY_FB_URLS` if a town slug differs on Facebook.

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
- `SCRAPE_FULL=1` — force every page even after a full scrape exists
- `SCRAPE_VERBOSE=1` — log every listing
- `APIFY_API_TOKEN` — Apify API token for Facebook Marketplace
- `APIFY_FB_PROFILE` — `weekly` (all Malta) or `daily-north` (Mellieha + St Paul's Bay)
- `APIFY_FB_MAX_PAGES` — cap Apify search pages (profile defaults: 50 weekly, 5 daily)
- `APIFY_FB_DAYS_LISTED` — Facebook date filter in days (profile defaults: 30 weekly, 7 daily)

Daily GitHub runs scan the first 5 pages once a source already has a successful full scrape. Sundays run a full pass so dropped listings can be inactivated. Locally: `python3 -m mtprop agencies --full`. Facebook: weekly full Malta on Sundays, daily Mellieha/St Paul's Bay Mon–Sat (`npm run scrape:facebook:daily`).

## Daily updates

GitHub Actions:

- `.github/workflows/daily-scrape.yml` — 03:00 UTC (5 newest pages; full scan on Sundays)
- `.github/workflows/weekly-nso.yml` — Mondays 06:00 UTC

Repository secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_API_TOKEN`.

## Valuation

Median comparable €/m² × subject floor area, ±20% size, same type. Street-level if at least five comps match. Otherwise locality, then district with a low-confidence flag.

The +12 month figure applies the latest official index YoY to that comps estimate. It is indicative, not a survey.

Optional `OPENAI_API_KEY` writes a short explanation of those comps. It does not set the price.
