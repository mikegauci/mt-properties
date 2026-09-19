from __future__ import annotations

import math
import os
import re
from typing import Any, Iterator

from ..features import amenities_from_text
from ..localities import normalize_type
from .html_pages import yield_paginated_pages
from .http import http_client, sleep

SOURCE = "alliance"
API = "https://alliance.mt/wp-admin/admin-ajax.php"
SITE = "https://alliance.mt"
PER_PAGE = 6
PAGE_CAP = int(os.environ.get("ALLIANCE_MAX_PAGES", "200"))

SKIP_NAME = re.compile(
    r"garage|parking|plot|site|airspace|office|shop|warehouse|commercial|land\b|agriculture",
    re.I,
)

SEARCH_PARAMS = {
    "params[isSale]": "true",
    "params[isResidential]": "true",
    "params[sortKey]": "created",
    "params[sortDirection]": "DESC",
}


def fetch() -> Iterator[dict]:
    with http_client() as http:
        first = _fetch_page(http, 1)
        total_pages = min(PAGE_CAP, max(1, math.ceil(first["count"] / PER_PAGE)))
        first_items = list(_parse_items(first["data"]))
    yield from yield_paginated_pages(SOURCE, total_pages, 1, first_items, _fetch_page_items)


def _fetch_page_items(page: int) -> list[dict]:
    sleep()
    with http_client() as http:
        payload = _fetch_page(http, page)
        return list(_parse_items(payload["data"]))


def _fetch_page(http, page: int) -> dict[str, Any]:
    response = http.post(
        API,
        data={"action": "fetch_property", "page": page, **SEARCH_PARAMS},
    )
    response.raise_for_status()
    return response.json()


def _parse_items(items: list[dict]) -> Iterator[dict]:
    for item in items:
        listing = _parse_item(item)
        if listing:
            yield listing


def _parse_item(item: dict) -> dict | None:
    if not item.get("isSale"):
        return None
    ref = str(item.get("referenceNumber") or "").strip()
    slug = str(item.get("slug") or "").strip()
    if not ref or not slug:
        return None
    property_type = normalize_type((item.get("category") or {}).get("title"))
    raw_type = (item.get("category") or {}).get("title") or ""
    if property_type is None and raw_type and SKIP_NAME.search(raw_type):
        return None
    price = item.get("price")
    if not price or int(price) <= 0:
        return None
    locality = _locality_name((item.get("locality") or {}).get("title"))
    write_up = str(item.get("writeUp") or "").strip()
    tag_text = " ".join(tag.get("name") or "" for tag in item.get("tags") or [])
    text = " ".join(part for part in (write_up, tag_text, raw_type, locality or "") if part)
    amenities = amenities_from_text(text, complete=False)
    sqm = item.get("totalArea") or item.get("plotArea")
    beds = item.get("numberOfBedrooms")
    return {
        "external_id": ref,
        "url": f"{SITE}/property/{slug}",
        "locality_name": locality,
        "street": None,
        "property_type": property_type,
        "beds": beds if beds else None,
        "sqm": sqm,
        "price": price,
        "title": write_up[:180] if write_up else f"{locality or ''} {raw_type}".strip()[:180],
        "image_url": _image_url(item),
        "raw": {
            "referenceNumber": ref,
            "slug": slug,
            "locality": locality,
            "category": raw_type,
            "created": item.get("created"),
        },
        **amenities,
    }


def _locality_name(raw: str | None) -> str | None:
    if not raw:
        return None
    text = re.sub(r"\s+", " ", raw.replace(".", " ")).strip()
    gozo = re.match(r"(?i)^gozo\s*[-–]?\s*(.+)$", text)
    if not gozo:
        return text
    rest = gozo.group(1).strip()
    if re.search(r"(?i)victoria|\brabat\b", rest):
        return "Rabat Gozo"
    return rest or text


def _image_url(item: dict) -> str | None:
    thumbnail = ((item.get("thumbnail") or {}).get("image") or {}).get("url")
    if thumbnail:
        return thumbnail
    for image in item.get("images") or []:
        url = (image.get("image") or {}).get("url")
        if url:
            return url
    return None
