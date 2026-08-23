from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Iterator, TypeVar

from .. import log
from .http import scrape_page_workers

T = TypeVar("T")


def yield_paginated_pages(
    source: str,
    capped: int,
    first_page: int,
    first_items: list[T],
    fetch_page: Callable[[int], list[T]],
) -> Iterator[T]:
    log.page(source, first_page, capped, len(first_items))
    yield from first_items
    remaining = list(range(first_page + 1, capped + 1))
    if not remaining:
        return
    workers = scrape_page_workers()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_page, page): page for page in remaining}
        for future in as_completed(futures):
            page = futures[future]
            items = future.result()
            log.page(source, page, capped, len(items))
            yield from items
