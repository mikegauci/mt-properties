from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Iterator

from . import log
from .agencies.http import http_client, image_backfill_delay, image_backfill_workers, page_limit, sleep
from .config import client
from .images import from_html, site_from_url
from .store import missing_image_rows, parse_image_url

PATCH_BATCH = 50


def run(source: str | None = None, *, workers: int | None = None) -> dict[str, int]:
    sources = [source] if source else ["propertymarket", "zanzi", "remax"]
    totals = {"updated": 0, "failed": 0, "skipped": 0, "total": 0}
    for src in sources:
        result = _run_source(src, workers=workers)
        for key in totals:
            totals[key] += result[key]
    return totals


def _run_source(source: str, *, workers: int | None = None) -> dict[str, int]:
    missing = missing_image_rows(source)
    if not missing:
        log.images_done(source, 0, 0, 0, 0)
        return {"updated": 0, "failed": 0, "skipped": 0, "total": 0}
    log.images_start(source, len(missing), workers or image_backfill_workers())
    if source == "remax":
        return _from_remax_list(missing)
    if source == "zanzi":
        from .agencies.zanzi import fetch

        return _from_feed(source, missing, fetch)
    if source == "propertymarket":
        from .agencies.propertymarket import fetch

        if len(missing) <= 300:
            result = _from_feed(source, missing, fetch)
            remaining = missing_image_rows(source)
            if not remaining:
                return result
            extra = _from_detail(source, remaining, workers=workers)
            return _merge_results(result, extra)
        return _from_detail(source, missing, workers=workers)
    return _from_detail(source, missing, workers=workers)


def _merge_results(*results: dict[str, int]) -> dict[str, int]:
    merged = {"updated": 0, "failed": 0, "skipped": 0, "total": 0}
    for result in results:
        for key in merged:
            merged[key] += result[key]
    return merged


def _from_feed(
    source: str,
    missing: list[dict[str, Any]],
    fetch: Callable[[], Iterator[dict[str, Any]]],
) -> dict[str, int]:
    wanted = {str(row["external_id"]): row["id"] for row in missing if row.get("external_id")}
    updated = 0
    failed = 0
    checked = 0
    pending: list[tuple[str, str]] = []
    with client() as db:
        for item in fetch():
            if not wanted:
                break
            checked += 1
            ext = str(item.get("external_id") or "")
            listing_id = wanted.get(ext)
            image_url = parse_image_url(item.get("image_url"))
            if not listing_id or not image_url:
                continue
            pending.append((listing_id, image_url))
            wanted.pop(ext, None)
            if len(pending) >= PATCH_BATCH:
                batch_updated, batch_failed = _patch_batch(db, pending)
                updated += batch_updated
                failed += batch_failed
                pending = []
            if updated and updated % 50 == 0:
                log.images(source, checked, len(missing), updated)
        if pending:
            batch_updated, batch_failed = _patch_batch(db, pending)
            updated += batch_updated
            failed += batch_failed
    skipped = len(wanted)
    log.images_done(source, updated, failed, skipped, len(missing))
    return {"updated": updated, "failed": failed, "skipped": skipped, "total": len(missing)}


def _from_detail(
    source: str,
    missing: list[dict[str, Any]],
    *,
    workers: int | None = None,
) -> dict[str, int]:
    pool_size = workers or image_backfill_workers()
    updated = 0
    failed = 0
    skipped = 0
    pending: list[tuple[str, str]] = []
    with client() as db, ThreadPoolExecutor(max_workers=pool_size) as pool:
        futures = {pool.submit(_fetch_detail_image, row): row for row in missing}
        done = 0
        for future in as_completed(futures):
            done += 1
            row = futures[future]
            listing_id = row["id"]
            url = row.get("url")
            if not url:
                skipped += 1
                continue
            try:
                image_url = future.result()
            except Exception:
                failed += 1
                continue
            if not image_url:
                skipped += 1
                continue
            pending.append((listing_id, image_url))
            if len(pending) >= PATCH_BATCH:
                batch_updated, batch_failed = _patch_batch(db, pending)
                updated += batch_updated
                failed += batch_failed
                pending = []
            if done % 50 == 0:
                log.images(source, done, len(missing), updated)
        if pending:
            batch_updated, batch_failed = _patch_batch(db, pending)
            updated += batch_updated
            failed += batch_failed
    log.images_done(source, updated, failed, skipped, len(missing))
    return {"updated": updated, "failed": failed, "skipped": skipped, "total": len(missing)}


def _fetch_detail_image(row: dict[str, Any]) -> str | None:
    url = row.get("url")
    if not url:
        return None
    delay = image_backfill_delay()
    if delay:
        time.sleep(delay)
    with http_client() as web:
        response = web.get(url)
        response.raise_for_status()
        return from_html(response.text, site_from_url(url))


def _from_remax_list(missing: list[dict[str, Any]]) -> dict[str, int]:
    from .agencies.remax import BASE, _parse_page

    wanted = {str(row["external_id"]): row["id"] for row in missing if row.get("external_id")}
    updated = 0
    failed = 0
    take = 100
    pending: list[tuple[str, str]] = []
    with http_client() as web, client() as db:
        first = web.get(BASE, params={"ForSale": "true", "Residential": "true", "Take": take, "page": 1})
        first.raise_for_status()
        payload = first.json().get("data") or {}
        total = int(payload.get("TotalSearchResults") or 0)
        total_pages = max(1, (total + take - 1) // take)
        capped = page_limit(total_pages)
        batches = [(1, payload.get("Properties") or [])]
        for page in range(2, capped + 1):
            batches.append((page, None))
        checked = 0
        for page, properties in batches:
            if not wanted:
                break
            if properties is None:
                sleep()
                response = web.get(
                    BASE,
                    params={"ForSale": "true", "Residential": "true", "Take": take, "page": page},
                )
                response.raise_for_status()
                properties = (response.json().get("data") or {}).get("Properties") or []
            for item in _parse_page(properties):
                checked += 1
                ext = str(item.get("external_id") or "")
                listing_id = wanted.get(ext)
                image_url = parse_image_url(item.get("image_url"))
                if not listing_id or not image_url:
                    continue
                pending.append((listing_id, image_url))
                wanted.pop(ext, None)
                if len(pending) >= PATCH_BATCH:
                    batch_updated, batch_failed = _patch_batch(db, pending)
                    updated += batch_updated
                    failed += batch_failed
                    pending = []
            log.page("remax", page, capped, len(properties))
        if pending:
            batch_updated, batch_failed = _patch_batch(db, pending)
            updated += batch_updated
            failed += batch_failed
    skipped = len(wanted)
    log.images_done("remax", updated, failed, skipped, len(missing))
    return {"updated": updated, "failed": failed, "skipped": skipped, "total": len(missing)}


def _patch_batch(db, pairs: list[tuple[str, str]]) -> tuple[int, int]:
    updated = 0
    failed = 0
    for listing_id, image_url in pairs:
        if _patch(db, listing_id, image_url):
            updated += 1
        else:
            failed += 1
    return updated, failed


def _patch(db, listing_id: str, image_url: str) -> bool:
    response = db.patch(
        f"/listings?id=eq.{listing_id}",
        json={"image_url": image_url},
        headers={"prefer": "return=minimal"},
    )
    return response.status_code < 300
