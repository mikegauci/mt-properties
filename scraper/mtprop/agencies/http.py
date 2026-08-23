from __future__ import annotations

import os
import time
from contextvars import ContextVar, Token

import httpx

HEADERS = {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "accept": "application/json, text/html;q=0.9",
}


def sleep() -> None:
    time.sleep(float(os.environ.get("SCRAPE_DELAY_SECONDS", "0.1")))


def scrape_page_workers() -> int:
    raw = os.environ.get("SCRAPE_PAGE_WORKERS")
    return max(1, int(raw)) if raw else 3


def remax_detail_workers() -> int:
    raw = os.environ.get("REMAX_DETAIL_WORKERS")
    return max(1, int(raw)) if raw else 12


def image_backfill_workers() -> int:
    raw = os.environ.get("IMAGE_BACKFILL_WORKERS")
    return max(1, int(raw)) if raw else 12


def image_backfill_delay() -> float:
    raw = os.environ.get("IMAGE_BACKFILL_DELAY_SECONDS")
    if raw is not None:
        return max(0.0, float(raw))
    return 0.0


INCREMENTAL_PAGES = 5
_forced_max_pages: ContextVar[int | None] = ContextVar("_forced_max_pages", default=None)


def scrape_full() -> bool:
    return os.environ.get("SCRAPE_FULL", "").lower() in {"1", "true", "yes"}


def max_pages() -> int | None:
    raw = os.environ.get("SCRAPE_MAX_PAGES")
    if raw:
        return int(raw)
    return _forced_max_pages.get()


def use_max_pages(cap: int | None) -> Token[int | None]:
    return _forced_max_pages.set(cap)


def reset_max_pages(token: Token[int | None]) -> None:
    _forced_max_pages.reset(token)


def http_client() -> httpx.Client:
    return httpx.Client(headers=HEADERS, timeout=60.0, follow_redirects=True)


def page_limit(total_pages: int) -> int:
    cap = max_pages()
    return min(total_pages, cap) if cap else total_pages
