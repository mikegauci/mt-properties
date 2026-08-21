from __future__ import annotations

import argparse
import sys
import traceback

from . import nso
from .agencies import propertymarket, remax, zanzi
from . import log
from .store import FLUSH_SIZE, ListingSink, backfill_listing_areas, finish_run, start_run
from . import images_backfill

AGENCIES = {
    "remax": remax,
    "propertymarket": propertymarket,
    "zanzi": zanzi,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Malta property data pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("seed", help="Seed localities, NSO transactions, Eurostat HPI")
    sub.add_parser("nso", help="Refresh NSO / Eurostat series")

    agencies = sub.add_parser("agencies", help="Scrape agency listing feeds")
    agencies.add_argument("--source", choices=[*AGENCIES, "all"], default="all")
    agencies.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Log each listing (or set SCRAPE_VERBOSE=1)",
    )
    sub.add_parser("backfill-areas", help="Set listings.area from stored Town/Zone/title")
    images = sub.add_parser("backfill-images", help="Fill missing listing thumbnails from stored URLs")
    images.add_argument("--source", choices=[*AGENCIES, "all"], default="all")
    images.add_argument(
        "--workers",
        type=int,
        default=None,
        help="Parallel detail-page fetches (default 12, or IMAGE_BACKFILL_WORKERS)",
    )

    args = parser.parse_args(argv)
    log.configure(verbose=bool(getattr(args, "verbose", False)))

    if args.command in {"seed", "nso"}:
        result = nso.ingest_all()
        print(result)
        return 0

    if args.command == "backfill-areas":
        updated = backfill_listing_areas()
        print({"areas_updated": updated})
        return 0

    if args.command == "backfill-images":
        source = None if args.source == "all" else args.source
        result = images_backfill.run(source, workers=args.workers)
        print(result)
        return 0

    sources = list(AGENCIES) if args.source == "all" else [args.source]
    failed = False
    for source in sources:
        failed = run_agency(source) or failed
    return 1 if failed else 0


def run_agency(source: str) -> bool:
    module = AGENCIES[source]
    run_id = start_run(source)
    log.source_start(source)
    images_backfill.run(source)
    sink = ListingSink(source)
    scraped = 0
    try:
        batch: list[dict] = []
        for listing in module.fetch():
            if log.verbose_enabled():
                log.listing(source, listing)
            batch.append(listing)
            scraped += 1
            if len(batch) >= FLUSH_SIZE:
                sink.write(batch)
                log.stored(source, sink.upserted, scraped, sink.skipped)
                batch = []
        if batch:
            sink.write(batch)
            log.stored(source, sink.upserted, scraped, sink.skipped)
        inactivated = sink.finalize()
        finish_run(run_id, upserted=sink.upserted, inactivated=inactivated)
        log.source_done(source, scraped, sink.upserted, inactivated, sink.duplicates, sink.skipped)
        return False
    except Exception as exc:
        traceback.print_exc()
        finish_run(run_id, upserted=sink.upserted, inactivated=0, error=str(exc))
        print(f"{source}: error {exc}", file=sys.stderr)
        return True


if __name__ == "__main__":
    raise SystemExit(main())
