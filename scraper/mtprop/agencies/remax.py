from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Iterator

from .http import http_client, page_limit, remax_detail_workers, sleep
from .. import log
from ..features import amenities_from_remax_detail, garage_from_remax
from ..images import absolute
from ..store import listings_already_detailed

SOURCE = "remax"
BASE = "https://remax-malta.com/api/properties"
SITE = "https://remax-malta.com/listings"


def fetch() -> Iterator[dict]:
    take = 100
    listings: list[dict] = []
    with http_client() as http:
        first = http.get(BASE, params={"ForSale": "true", "Residential": "true", "Take": take, "page": 1})
        first.raise_for_status()
        payload = first.json().get("data") or {}
        total = int(payload.get("TotalSearchResults") or 0)
        total_pages = max(1, (total + take - 1) // take)
        capped = page_limit(total_pages)
        items = list(_parse_page(payload.get("Properties") or []))
        log.page(SOURCE, 1, capped, len(items))
        listings.extend(items)
        for page in range(2, capped + 1):
            sleep()
            response = http.get(
                BASE,
                params={"ForSale": "true", "Residential": "true", "Take": take, "page": page},
            )
            response.raise_for_status()
            items = list(_parse_page((response.json().get("data") or {}).get("Properties") or []))
            log.page(SOURCE, page, capped, len(items))
            listings.extend(items)
    yield from _enrich_details(listings)


def _parse_page(items: list[dict]) -> Iterator[dict]:
    for item in items:
        if item.get("TransactionType") not in ("For Sale", None):
            continue
        if item.get("Status") not in (None, "Active"):
            continue
        mls = str(item.get("MLS") or item.get("Id") or "")
        if not mls:
            continue
        url = f"{SITE}/{mls}"
        includes = item.get("PropertyIncludesGarage")
        garage_type = item.get("GarageType")
        yield {
            "external_id": mls,
            "url": url,
            "locality_name": item.get("Town"),
            "street": item.get("Zone"),
            "property_type": item.get("PropertyType"),
            "beds": item.get("TotalBedrooms"),
            "sqm": item.get("TotalIntArea") or item.get("TotalSqm"),
            "ext_sqm": item.get("TotalExtArea"),
            "price": item.get("Price"),
            "title": f"{item.get('Town') or ''} {item.get('PropertyType') or ''}".strip(),
            "image_url": absolute(item.get("Image") or item.get("DefaultPhoto")),
            "has_garage": garage_from_remax(includes=includes, garage_type=garage_type),
            "raw": {
                "MLS": mls,
                "Town": item.get("Town"),
                "Zone": item.get("Zone"),
                "PropertyType": item.get("PropertyType"),
                "Price": item.get("Price"),
                "TotalSqm": item.get("TotalSqm"),
                "TotalExtArea": item.get("TotalExtArea"),
                "PropertyIncludesGarage": includes,
                "GarageType": garage_type,
            },
        }


def _enrich_details(listings: list[dict]) -> Iterator[dict]:
    known = listings_already_detailed(SOURCE)
    pending: list[dict] = []
    skipped = 0
    for listing in listings:
        if listing["external_id"] in known:
            skipped += 1
            yield listing
        else:
            pending.append(listing)
    if not pending:
        log.details(SOURCE, 0, skipped, 0)
        return
    fetched = 0
    failed = 0
    workers = remax_detail_workers()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch_detail, listing): listing for listing in pending}
        for future in as_completed(futures):
            listing = futures[future]
            try:
                result = future.result()
            except Exception as exc:
                failed += 1
                log.detail_failed(SOURCE, listing["external_id"], exc)
                yield listing
                continue
            if result is listing:
                failed += 1
            else:
                fetched += 1
            yield result
    log.details(SOURCE, fetched, skipped, failed)


def _fetch_detail(listing: dict) -> dict:
    mls = listing["external_id"]
    sleep()
    try:
        with http_client() as http:
            response = http.get(f"{BASE}/{mls}")
            response.raise_for_status()
            payload = response.json()
            detail = payload.get("data") if isinstance(payload.get("data"), dict) else payload
            if not isinstance(detail, dict):
                raise ValueError("unexpected detail payload")
    except Exception as exc:
        log.detail_failed(SOURCE, mls, exc)
        return listing
    return _apply_detail(listing, detail)


def _apply_detail(listing: dict, detail: dict[str, Any]) -> dict:
    raw = dict(listing.get("raw") or {})
    amenities = amenities_from_remax_detail(
        detail,
        list_includes=raw.get("PropertyIncludesGarage"),
        list_garage_type=raw.get("GarageType"),
    )
    updated = {**listing, **amenities}
    features = detail.get("Features") or []
    names = []
    if isinstance(features, list):
        for item in features:
            if isinstance(item, dict) and item.get("Name"):
                names.append(item["Name"])
            elif isinstance(item, str):
                names.append(item)
    raw["GarageType"] = detail.get("GarageType") or raw.get("GarageType")
    raw["PropertyIncludesGarage"] = detail.get("PropertyIncludesGarage", raw.get("PropertyIncludesGarage"))
    raw["Features"] = names[:40]
    ext_sqm = _detail_ext_sqm(detail)
    if ext_sqm is not None:
        updated["ext_sqm"] = ext_sqm
        raw["TotalExtArea"] = ext_sqm
    updated["raw"] = raw
    return updated


def _detail_ext_sqm(detail: dict[str, Any]) -> Any:
    meas = detail.get("Measurment") or detail.get("Measurement")
    if isinstance(meas, dict):
        for key in ("ExternalArea", "ExternalSqm", "TotalExtArea"):
            if meas.get(key):
                return meas.get(key)
    return detail.get("TotalExtArea")
