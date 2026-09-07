from __future__ import annotations

from typing import Any, Iterable

FLUSH_SIZE = 80


def chunks(items: list[Any], size: int) -> Iterable[list[Any]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def all_rows(http, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page = 1000
    start = 0
    while True:
        response = http.get(
            path,
            params=params,
            headers={"range": f"{start}-{start + page - 1}", "prefer": "count=exact"},
        )
        if response.status_code >= 300:
            raise RuntimeError(f"Listing page failed: {response.status_code} {response.text}")
        batch = response.json()
        if not isinstance(batch, list):
            raise RuntimeError(f"Unexpected listings payload: {batch}")
        rows.extend(batch)
        if len(batch) < page:
            break
        start += page
        if start > 200000:
            break
    return rows
