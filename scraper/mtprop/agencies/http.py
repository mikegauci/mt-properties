from __future__ import annotations

import os
import time

import httpx

HEADERS = {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "accept": "application/json, text/html;q=0.9",
}


def sleep() -> None:
    time.sleep(float(os.environ.get("SCRAPE_DELAY_SECONDS", "0.1")))


def max_pages() -> int | None:
    raw = os.environ.get("SCRAPE_MAX_PAGES")
    return int(raw) if raw else None


def http_client() -> httpx.Client:
    return httpx.Client(headers=HEADERS, timeout=60.0, follow_redirects=True)


def page_limit(total_pages: int) -> int:
    cap = max_pages()
    return min(total_pages, cap) if cap else total_pages
