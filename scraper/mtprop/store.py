from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from .agencies.http import max_pages
from .config import client
from .localities import fetch_locality_ids, fingerprint, match_area, match_locality, normalize_type


def parse_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if number > 0 else None
    text = str(value).replace(",", "").replace("€", "").strip()
    try:
        number = float(text)
    except ValueError:
        return None
    return number if number > 0 else None


def parse_int(value: Any) -> int | None:
    number = parse_number(value)
    return int(number) if number is not None else None


def parse_image_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if text.startswith("http://") or text.startswith("https://"):
        return text
    return None


def listing_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


class NormalizedListing(dict):
    source: str
    external_id: str
    url: str
    locality_name: str | None
    street: str | None
    area: str | None
    property_type: str | None
    beds: int | None
    sqm: float | None
    ext_sqm: float | None
    price: float | None
    title: str | None
    image_url: str | None
    finish: str | None
    has_garage: bool | None
    has_pool: bool | None
    has_lift: bool | None
    raw: dict[str, Any]


OPTIONAL_KEYS = ("ext_sqm", "finish", "has_garage", "has_pool", "has_lift")


MIN_ACTIVE_FOR_INCREMENTAL = 200


def source_ready_for_incremental(source: str) -> bool:
    with client() as http:
        runs = http.get(
            "/scrape_runs",
            params={
                "source": f"eq.{source}",
                "status": "eq.ok",
                "select": "id",
                "limit": "1",
            },
        )
        if runs.status_code >= 300:
            raise RuntimeError(f"Scrape run lookup failed: {runs.status_code} {runs.text}")
        if not runs.json():
            return False
        listings = http.get(
            "/listings",
            params={"source": f"eq.{source}", "is_active": "eq.true", "select": "id"},
            headers={"range": "0-0", "prefer": "count=exact"},
        )
        if listings.status_code >= 300:
            raise RuntimeError(
                f"Listing count failed: {listings.status_code} {listings.text}"
            )
        return _exact_count(listings) >= MIN_ACTIVE_FOR_INCREMENTAL


def _exact_count(response) -> int:
    header = response.headers.get("content-range") or ""
    if "/" not in header:
        return 0
    total = header.rsplit("/", 1)[-1]
    return int(total) if total.isdigit() else 0


def start_run(source: str) -> str:
    with client() as http:
        response = http.post("/scrape_runs", json={"source": source, "status": "running"})
        response.raise_for_status()
        return response.json()[0]["id"]


def finish_run(run_id: str, *, upserted: int, inactivated: int, error: str | None = None) -> None:
    payload = {
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "listings_upserted": upserted,
        "listings_inactivated": inactivated,
        "status": "error" if error else "ok",
        "error": error,
    }
    with client() as http:
        response = http.patch(f"/scrape_runs?id=eq.{run_id}", json=payload)
        if response.status_code >= 300:
            raise RuntimeError(f"Failed to finish scrape run: {response.text}")


def _listing_quality(row: dict[str, Any]) -> tuple[int, int, int]:
    return (
        1 if row.get("street") else 0,
        1 if row.get("beds") else 0,
        1 if row.get("sqm") else 0,
    )


def dedupe_by_external_id(listings: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    seen: dict[str, dict[str, Any]] = {}
    for item in listings:
        seen[str(item["external_id"])] = item
    deduped = list(seen.values())
    return deduped, len(listings) - len(deduped)


def dedupe_rows_by_url(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    by_url: dict[str, dict[str, Any]] = {}
    no_url: list[dict[str, Any]] = []
    removed = 0
    for row in rows:
        url = listing_url(row.get("url"))
        if not url:
            no_url.append(row)
            continue
        existing = by_url.get(url)
        if not existing:
            by_url[url] = row
            continue
        removed += 1
        if _listing_quality(row) > _listing_quality(existing):
            by_url[url] = row
    return no_url + list(by_url.values()), removed


def listing_area(slug: str | None, item: dict[str, Any]) -> str | None:
    raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
    return match_area(
        slug,
        raw.get("Zone"),
        item.get("street"),
        raw.get("Town"),
        item.get("locality_name"),
        item.get("title"),
        raw.get("text"),
        raw.get("Description"),
        raw.get("description"),
    )


def backfill_listing_areas() -> int:
    locality_ids = fetch_locality_ids()
    id_to_slug = {locality_id: slug for slug, locality_id in locality_ids.items()}
    updated = 0
    with client() as http:
        rows = _all_rows(
            http,
            "/listings",
            {
                "select": "id,locality_id,street,title,area,raw",
                "order": "id",
            },
        )
        for row in rows:
            slug = id_to_slug.get(row["locality_id"]) if row.get("locality_id") else None
            raw = row.get("raw") if isinstance(row.get("raw"), dict) else {}
            area = match_area(
                slug,
                raw.get("Zone"),
                row.get("street"),
                raw.get("Town"),
                row.get("title"),
                raw.get("text"),
                raw.get("Description"),
                raw.get("description"),
            )
            if area == row.get("area"):
                continue
            response = http.patch(
                f"/listings?id=eq.{row['id']}",
                json={"area": area},
                headers={"prefer": "return=minimal"},
            )
            if response.status_code >= 300:
                raise RuntimeError(f"Area backfill failed: {response.status_code} {response.text}")
            updated += 1
    return updated


def missing_image_rows(source: str | None = None) -> list[dict[str, Any]]:
    params = {
        "select": "id,source,external_id,url",
        "image_url": "is.null",
        "is_active": "eq.true",
        "order": "id",
    }
    if source:
        params["source"] = f"eq.{source}"
    with client() as http:
        return _all_rows(http, "/listings", params)


def listings_already_detailed(source: str) -> set[str]:
    with client() as http:
        rows = _all_rows(
            http,
            "/listings",
            {
                "select": "external_id",
                "source": f"eq.{source}",
                "has_pool": "not.is.null",
                "has_lift": "not.is.null",
                "order": "id",
            },
        )
    return {str(row["external_id"]) for row in rows if row.get("external_id")}


def _load_source_listings(source: str) -> dict[str, dict[str, Any]]:
    with client() as http:
        rows = _all_rows(
            http,
            "/listings",
            {
                "select": "id,external_id,price,is_active,image_url",
                "source": f"eq.{source}",
                "order": "id",
            },
        )
    return {str(row["external_id"]): row for row in rows if row.get("external_id")}


def _touch_last_seen(http, listing_ids: list[str], now: str) -> None:
    for chunk_ids in chunks(listing_ids, FLUSH_SIZE):
        filt = ",".join(chunk_ids)
        patch = http.patch(
            f"/listings?id=in.({filt})",
            json={"last_seen": now},
            headers={"prefer": "return=minimal"},
        )
        if patch.status_code >= 300:
            raise RuntimeError(f"last_seen touch failed: {patch.text}")


FLUSH_SIZE = 80


class ListingSink:
    def __init__(self, source: str):
        self.source = source
        self.locality_ids = fetch_locality_ids()
        self.existing_urls = _load_listing_urls()
        self.known = _load_source_listings(source)
        self.claimed_urls: set[str] = set()
        self.seen_ids: list[str] = []
        self.upserted = 0
        self.duplicates = 0
        self.skipped = 0
        self.inactivated = 0

    def write(self, listings: list[dict[str, Any]]) -> None:
        if not listings:
            return
        now = datetime.now(timezone.utc).isoformat()
        materialized, ext_dupes = dedupe_by_external_id(listings)
        self.duplicates += ext_dupes

        incoming: list[dict[str, Any]] = []
        refresh_ids: list[str] = []
        for item in materialized:
            external_id = str(item["external_id"])
            prev = self.known.get(external_id)
            if prev and prev.get("is_active"):
                self.seen_ids.append(external_id)
                new_price = parse_number(item.get("price"))
                old_price = parse_number(prev.get("price"))
                new_image = parse_image_url(item.get("image_url"))
                if (new_price and old_price != new_price) or (new_image and not prev.get("image_url")):
                    incoming.append(item)
                else:
                    if prev.get("id"):
                        refresh_ids.append(prev["id"])
                    self.skipped += 1
                continue
            incoming.append(item)

        if refresh_ids:
            with client() as http:
                _touch_last_seen(http, refresh_ids, now)

        if not incoming:
            return

        rows: list[dict[str, Any]] = []
        for item in incoming:
            external_id = str(item["external_id"])
            slug = match_locality(item.get("locality_name"))
            property_type = normalize_type(item.get("property_type"))
            sqm = parse_number(item.get("sqm"))
            price = parse_number(item.get("price"))
            street = (item.get("street") or None) and str(item.get("street")).strip()
            row: dict[str, Any] = {
                "source": self.source,
                "external_id": external_id,
                "url": item["url"],
                "locality_id": self.locality_ids.get(slug) if slug else None,
                "street": street,
                "property_type": property_type,
                "beds": parse_int(item.get("beds")),
                "sqm": sqm,
                "price": price,
                "title": item.get("title"),
                "last_seen": now,
                "is_active": True,
                "fingerprint": fingerprint(slug, property_type, sqm, street),
                "raw": item.get("raw"),
            }
            ext_sqm = parse_number(item.get("ext_sqm"))
            if ext_sqm is not None:
                row["ext_sqm"] = ext_sqm
            image_url = parse_image_url(item.get("image_url"))
            if image_url:
                row["image_url"] = image_url
            row["area"] = listing_area(slug, item)
            for key in OPTIONAL_KEYS:
                if key == "ext_sqm":
                    continue
                if key in item and item[key] is not None:
                    row[key] = item[key]
            rows.append(row)

        rows, url_dupes = dedupe_rows_by_url(rows)
        rows, cross_dupes = _drop_url_dupes(
            self.source, rows, self.existing_urls, self.claimed_urls
        )
        self.duplicates += url_dupes + cross_dupes
        self.seen_ids.extend(row["external_id"] for row in rows)
        if not rows:
            return

        with client() as http:
            self.upserted += _post_listing_rows(http, self.source, rows, now)
        for row in rows:
            url = listing_url(row.get("url"))
            if url:
                self.existing_urls[url] = {
                    "source": self.source,
                    "external_id": row["external_id"],
                }
            previous = self.known.get(row["external_id"]) or {}
            self.known[row["external_id"]] = {
                "id": previous.get("id"),
                "external_id": row["external_id"],
                "price": row.get("price"),
                "is_active": True,
                "image_url": row.get("image_url") or previous.get("image_url"),
            }

    def finalize(self, *, inactivate_missing: bool = True) -> int:
        with client() as http:
            if inactivate_missing and self.seen_ids and not max_pages():
                self.inactivated += _inactivate_missing(http, self.source, set(self.seen_ids))
        return self.inactivated


def upsert_listings(source: str, listings: Iterable[dict[str, Any]]) -> tuple[int, int, int]:
    sink = ListingSink(source)
    sink.write(list(listings))
    inactivated = sink.finalize()
    return sink.upserted, inactivated, sink.duplicates


def _load_listing_urls() -> dict[str, dict[str, Any]]:
    with client() as http:
        rows = _all_rows(
            http,
            "/listings",
            {
                "select": "id,source,external_id,url",
                "order": "id",
            },
        )
    by_url: dict[str, dict[str, Any]] = {}
    for row in rows:
        url = listing_url(row.get("url"))
        if url and url not in by_url:
            by_url[url] = row
    return by_url


def _drop_url_dupes(
    source: str,
    rows: list[dict[str, Any]],
    existing: dict[str, dict[str, Any]],
    claimed: set[str],
) -> tuple[list[dict[str, Any]], int]:
    kept: list[dict[str, Any]] = []
    removed = 0
    for row in rows:
        url = listing_url(row.get("url"))
        if not url:
            kept.append(row)
            continue
        if url in claimed:
            removed += 1
            continue
        match = existing.get(url)
        if match and not (
            match["source"] == source and match["external_id"] == row["external_id"]
        ):
            removed += 1
            continue
        claimed.add(url)
        kept.append(row)
    return kept, removed


def _post_listing_rows(http, source: str, rows: list[dict[str, Any]], now: str) -> int:
    upserted = 0
    for chunk in chunks(rows, FLUSH_SIZE):
        existing_by_ext = _existing(http, source, [row["external_id"] for row in chunk])
        new_rows: list[dict[str, Any]] = []
        existing_rows: list[dict[str, Any]] = []
        for row in chunk:
            if existing_by_ext.get(row["external_id"]):
                existing_rows.append(row)
            else:
                row["first_seen"] = now
                new_rows.append(row)
        for group in (new_rows, existing_rows):
            for batch in uniform_key_chunks(group, FLUSH_SIZE):
                response = http.post(
                    "/listings",
                    params={"on_conflict": "source,external_id", "select": "id,external_id,price"},
                    headers={"prefer": "resolution=merge-duplicates,return=representation"},
                    json=batch,
                )
                if response.status_code >= 300:
                    raise RuntimeError(f"Listing upsert failed: {response.status_code} {response.text}")
                saved = response.json()
                upserted += len(saved)
                snapshots = []
                for saved_row in saved:
                    previous = existing_by_ext.get(saved_row["external_id"])
                    new_price = parse_number(saved_row.get("price"))
                    old_price = parse_number(previous.get("price") if previous else None)
                    if new_price and (not previous or old_price != new_price):
                        snapshots.append(
                            {
                                "listing_id": saved_row["id"],
                                "price": new_price,
                                "observed_at": now,
                            }
                        )
                if snapshots:
                    snap = http.post(
                        "/listing_price_snapshots",
                        headers={"prefer": "return=minimal"},
                        json=snapshots,
                    )
                    if snap.status_code >= 300:
                        raise RuntimeError(f"Snapshot insert failed: {snap.text}")
    return upserted


def _inactivate_missing(http, source: str, seen_ids: set[str]) -> int:
    active = _all_rows(
        http,
        "/listings",
        {
            "select": "id,external_id",
            "source": f"eq.{source}",
            "is_active": "eq.true",
            "order": "id",
        },
    )
    missing = [row["id"] for row in active if row["external_id"] not in seen_ids]
    inactivated = 0
    for chunk_ids in chunks(missing, FLUSH_SIZE):
        filt = ",".join(chunk_ids)
        patch = http.patch(
            f"/listings?id=in.({filt})",
            json={"is_active": False},
            headers={"prefer": "return=minimal"},
        )
        if patch.status_code >= 300:
            raise RuntimeError(f"Inactivate failed: {patch.text}")
        inactivated += len(chunk_ids)
    return inactivated


def _existing(http, source: str, external_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not external_ids:
        return {}
    found: dict[str, dict[str, Any]] = {}
    for group in chunks(external_ids, 80):
        quoted = ",".join(f'"{item}"' for item in group)
        response = http.get(
            "/listings",
            params={
                "select": "id,external_id,price",
                "source": f"eq.{source}",
                "external_id": f"in.({quoted})",
            },
        )
        if response.status_code >= 300:
            raise RuntimeError(
                f"Existing listings lookup failed: {response.status_code} {response.text}"
            )
        for row in response.json():
            found[row["external_id"]] = row
    return found


def _all_rows(http, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
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


def chunks(items: list[Any], size: int) -> Iterable[list[Any]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def uniform_key_chunks(rows: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    groups: dict[tuple[str, ...], list[dict[str, Any]]] = {}
    for row in rows:
        groups.setdefault(tuple(sorted(row)), []).append(row)
    for group in groups.values():
        yield from chunks(group, size)
