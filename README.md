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

5. Scrape listings (polite public JSON/HTML; no logins):

```bash
PYTHONPATH=scraper python3 -m mtprop agencies
```

RE/MAX exposes a public JSON feed. PropertyMarket and Zanzi are public HTML listing pages. A partial test run:

```bash
SCRAPE_MAX_PAGES=1 PYTHONPATH=scraper python3 -m mtprop agencies --source zanzi
```

## Daily updates

GitHub Actions:

- `.github/workflows/daily-scrape.yml` — 03:00 UTC
- `.github/workflows/weekly-nso.yml` — Mondays 06:00 UTC

Repository secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Valuation

Median comparable €/m² × subject floor area, ±20% size, same type. Street-level if at least five comps match. Otherwise locality, then district with a low-confidence flag.

The +12 month figure applies the latest official index YoY to that comps estimate. It is indicative, not a survey.

Optional `OPENAI_API_KEY` writes a short explanation of those comps. It does not set the price.
