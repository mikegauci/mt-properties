from __future__ import annotations

import logging
import os
import sys
from typing import Any

logger = logging.getLogger("mtprop")


def configure(*, verbose: bool | None = None) -> None:
    if verbose is None:
        verbose = os.environ.get("SCRAPE_VERBOSE", "").lower() in {"1", "true", "yes"}
    if logger.handlers:
        logger.setLevel(logging.DEBUG if verbose else logging.INFO)
        return
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    logger.propagate = False


def verbose_enabled() -> bool:
    return logger.isEnabledFor(logging.DEBUG)


def source_start(source: str, *, pages: int | None = None) -> None:
    if pages:
        logger.info("[%s] starting scrape — first %s pages", source, pages)
    else:
        logger.info("[%s] starting scrape", source)


def page(source: str, page: int, total: int, count: int) -> None:
    logger.info("[%s] page %s/%s — %s listings", source, page, total, count)


def listing(source: str, item: dict[str, Any]) -> None:
    logger.debug("[%s]   %s", source, _format_listing(item))


def images_start(source: str, total: int, workers: int) -> None:
    logger.info("[%s] images — %s missing, %s workers", source, total, workers)


def images(source: str, done: int, total: int, updated: int) -> None:
    logger.info("[%s] images — %s/%s checked, %s updated", source, done, total, updated)


def images_done(source: str, updated: int, failed: int, skipped: int, total: int) -> None:
    logger.info(
        "[%s] images done — %s updated, %s failed, %s skipped, %s missing",
        source,
        updated,
        failed,
        skipped,
        total,
    )


def details(source: str, fetched: int, skipped: int, failed: int) -> None:
    logger.info(
        "[%s] details — %s fetched, %s skipped, %s failed",
        source,
        fetched,
        skipped,
        failed,
    )


def detail_failed(source: str, external_id: str, exc: BaseException) -> None:
    logger.warning("[%s] detail %s failed: %s", source, external_id, exc)


def stored(source: str, upserted: int, scraped: int, skipped: int = 0) -> None:
    logger.info(
        "[%s] stored — %s in database (%s scraped so far, %s already present)",
        source,
        upserted,
        scraped,
        skipped,
    )


def source_done(
    source: str,
    scraped: int,
    upserted: int,
    inactivated: int,
    duplicates: int = 0,
    skipped: int = 0,
    *,
    duration_seconds: float | None = None,
) -> None:
    rate = scraped / duration_seconds if duration_seconds and duration_seconds > 0 else None
    if duration_seconds is not None and rate is not None:
        logger.info(
            "[%s] done — %s scraped, %s upserted, %s already present, %s inactivated, %s duplicates removed in %.1fs (%.1f listings/s)",
            source,
            scraped,
            upserted,
            skipped,
            inactivated,
            duplicates,
            duration_seconds,
            rate,
        )
        return
    logger.info(
        "[%s] done — %s scraped, %s upserted, %s already present, %s inactivated, %s duplicates removed",
        source,
        scraped,
        upserted,
        skipped,
        inactivated,
        duplicates,
    )


def _format_listing(item: dict[str, Any]) -> str:
    price = item.get("price")
    price_text = f"€{price:,}" if isinstance(price, (int, float)) else f"€{price}" if price else "no price"
    locality = item.get("locality_name") or "unknown locality"
    property_type = item.get("property_type") or "property"
    beds = item.get("beds")
    beds_text = f"{beds}-bed" if beds else None
    sqm = item.get("sqm")
    sqm_text = f"{sqm}m²" if sqm else None
    ref = item.get("external_id") or "?"
    title = (item.get("title") or "").strip()
    parts = [price_text, property_type, locality]
    if beds_text:
        parts.append(beds_text)
    if sqm_text:
        parts.append(sqm_text)
    summary = " — ".join(str(part) for part in parts if part)
    if title and title not in summary:
        summary = f"{summary} — {title[:80]}"
    return f"{summary} ({ref}) — {item.get('url', '')}"
