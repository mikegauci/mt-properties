from __future__ import annotations

import logging
import os
import re
from typing import Any, Iterator

from .. import log
from ..features import amenities_from_text
from ..localities import locality_rows, normalize_type
from ..store import parse_int, parse_number

SOURCE = "facebook"
DEFAULT_ACTOR = "curious_coder/facebook-marketplace"
DEFAULT_URL = (
    "https://www.facebook.com/marketplace/110612325626836/propertyforsale/"
    "?sortBy=creation_time_descend&daysSinceListed=30"
)
RENTAL = re.compile(r"\bfor rent\b|\bto let\b|\brental\b|\blong let\b", re.I)
ITEM_ID = re.compile(r"/marketplace/item/(\d+)")
BEDS = re.compile(r"(\d+)\s*(?:bed(?:room)?s?|br)\b", re.I)
SQM = re.compile(r"([\d.,]+)\s*(?:m2|m²|sqm|sq\.?\s*m)\b", re.I)
PROPERTY_TYPES = [
    "House of Character",
    "Terraced House",
    "Apartment",
    "Maisonette",
    "Penthouse",
    "Villa",
    "Townhouse",
    "Town House",
    "Farmhouse",
    "Bungalow",
    "Palazzo",
]


def fetch() -> Iterator[dict]:
    from apify_client import ApifyClient

    token = os.environ.get("APIFY_API_TOKEN")
    if not token:
        raise RuntimeError("Missing APIFY_API_TOKEN")

    actor_id = os.environ.get("APIFY_FB_ACTOR_ID", DEFAULT_ACTOR)
    max_pages = int(os.environ.get("APIFY_FB_MAX_PAGES", "50"))
    days = os.environ.get("APIFY_FB_DAYS_LISTED", "30")
    url = os.environ.get("APIFY_FB_URL") or _default_url(days)

    run_input = {
        "urls": [url],
        "getListingDetails": True,
        "getAllListingPhotos": False,
        "strictFiltering": True,
        "maxPagesPerUrl": max_pages,
        "proxy": {"useApifyProxy": True, "apifyProxyCountry": "MT"},
    }

    client = ApifyClient(token)
    logging.getLogger("mtprop").info("[%s] starting Apify actor %s", SOURCE, actor_id)
    run = client.actor(actor_id).call(run_input=run_input)
    dataset_id = run["defaultDatasetId"]
    kept = 0
    total = 0
    for item in client.dataset(dataset_id).iterate_items():
        total += 1
        listing = _normalize(item)
        if listing:
            kept += 1
            yield listing
    log.page(SOURCE, 1, 1, kept)
    logging.getLogger("mtprop").info(
        "[%s] Apify returned %s items, kept %s property listings", SOURCE, total, kept
    )


def ingest_items(items: Iterable[dict[str, Any]]) -> dict[str, int]:
    from ..store import FLUSH_SIZE, ListingSink, finish_run, start_run

    run_id = start_run(SOURCE)
    sink = ListingSink(SOURCE)
    scraped = 0
    batch: list[dict] = []
    try:
        for item in items:
            listing = _normalize(item)
            if not listing:
                continue
            batch.append(listing)
            scraped += 1
            if len(batch) >= FLUSH_SIZE:
                sink.write(batch)
                batch = []
        if batch:
            sink.write(batch)
        inactivated = sink.finalize()
        finish_run(run_id, upserted=sink.upserted, inactivated=inactivated)
        return {
            "scraped": scraped,
            "upserted": sink.upserted,
            "inactivated": inactivated,
            "skipped": sink.skipped,
            "duplicates": sink.duplicates,
        }
    except Exception as exc:
        finish_run(run_id, upserted=sink.upserted, inactivated=0, error=str(exc))
        raise exc


def _default_url(days: str) -> str:
    base = DEFAULT_URL.split("daysSinceListed=")[0]
    return f"{base}daysSinceListed={days}"


def _normalize(item: dict[str, Any]) -> dict[str, Any] | None:
    if item.get("is_sold") or item.get("isSold"):
        return None
    if item.get("is_pending") or item.get("isPending"):
        return None

    external_id = _external_id(item)
    url = _url(item, external_id)
    if not external_id or not url:
        return None

    title = _title(item)
    description = _description(item)
    blob = " ".join(part for part in (title, description) if part)
    if RENTAL.search(blob):
        return None

    price = _price(item)
    if not price or price <= 0:
        return None

    locality_name = _locality(item, blob)
    property_type = _property_type(item, blob)
    beds = _beds(item, blob)
    sqm = _sqm(item, blob)
    image_url = _image(item)
    amenities = amenities_from_text(blob, complete=False)

    return {
        "external_id": external_id,
        "url": url,
        "locality_name": locality_name,
        "street": None,
        "property_type": property_type,
        "beds": beds,
        "sqm": sqm,
        "price": price,
        "title": (title or blob)[:180],
        "image_url": image_url,
        "raw": item,
        **amenities,
    }


def _external_id(item: dict[str, Any]) -> str | None:
    for key in ("id", "listingId", "listing_id"):
        value = item.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    url = _raw_url(item)
    if url:
        match = ITEM_ID.search(url)
        if match:
            return match.group(1)
    return None


def _raw_url(item: dict[str, Any]) -> str | None:
    for key in ("url", "listingUrl", "listing_url"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    story = item.get("story")
    if isinstance(story, dict):
        value = story.get("url")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _url(item: dict[str, Any], external_id: str) -> str | None:
    url = _raw_url(item)
    if url:
        return url
    return f"https://www.facebook.com/marketplace/item/{external_id}/"


def _title(item: dict[str, Any]) -> str | None:
    for key in ("marketplace_listing_title", "custom_title", "title", "name"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _description(item: dict[str, Any]) -> str:
    for key in ("description", "listingDescription"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    redacted = item.get("redacted_description")
    if isinstance(redacted, dict):
        value = redacted.get("text")
        if isinstance(value, str) and value.strip():
            return value.strip()
    attributes = item.get("attributes")
    if isinstance(attributes, dict):
        value = attributes.get("description")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _price(item: dict[str, Any]) -> float | None:
    listing_price = item.get("listing_price")
    if isinstance(listing_price, dict):
        amount = parse_number(listing_price.get("amount"))
        if amount:
            return amount
    for key in ("price", "priceAmount", "price_amount"):
        amount = parse_number(item.get(key))
        if amount:
            return amount
    formatted = item.get("formatted_price")
    if isinstance(formatted, dict):
        text = formatted.get("text")
        if isinstance(text, str):
            match = re.search(r"([\d.,]+)", text.replace(",", ""))
            if match:
                return parse_number(match.group(1))
    return None


def _image(item: dict[str, Any]) -> str | None:
    for key in ("primary_listing_photo_url", "primaryPhoto", "imageUrl", "image_url"):
        value = item.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value
    photos = item.get("photos") or item.get("listingPhotos")
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, str) and first.startswith("http"):
            return first
        if isinstance(first, dict):
            for key in ("uri", "url"):
                value = first.get(key)
                if isinstance(value, str) and value.startswith("http"):
                    return value
    return None


def _locality(item: dict[str, Any], blob: str) -> str | None:
    location_text = item.get("location_text")
    if isinstance(location_text, dict):
        text = location_text.get("text")
        if isinstance(text, str) and text.strip():
            matched = _match_locality_name(text)
            if matched:
                return matched
    location = item.get("location")
    if isinstance(location, dict):
        reverse = location.get("reverse_geocode")
        if isinstance(reverse, dict):
            city_page = reverse.get("city_page")
            if isinstance(city_page, dict):
                display = city_page.get("display_name")
                if isinstance(display, str) and display.strip():
                    matched = _match_locality_name(display)
                    if matched:
                        return matched
            for key in ("city", "state"):
                value = reverse.get(key)
                if isinstance(value, str) and value.strip():
                    matched = _match_locality_name(value)
                    if matched:
                        return matched
    for key in ("locationName", "location_name", "city"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            matched = _match_locality_name(value)
            if matched:
                return matched
    return _match_locality_name(blob)


def _match_locality_name(text: str) -> str | None:
    lower = text.lower()
    for row in locality_rows():
        for alias in [row["name_en"], row["name_mt"], *row.get("aliases", [])]:
            if alias.lower() in lower:
                return alias
    return None


def _property_type(item: dict[str, Any], blob: str) -> str | None:
    attributes = item.get("attributes")
    if isinstance(attributes, dict):
        for key in ("propertyType", "property_type", "homeType"):
            raw = attributes.get(key)
            if isinstance(raw, str) and raw.strip():
                normalized = normalize_type(raw)
                if normalized:
                    return normalized
    lower = blob.lower()
    for candidate in PROPERTY_TYPES:
        if candidate.lower() in lower:
            return normalize_type(candidate)
    return normalize_type(blob)


def _beds(item: dict[str, Any], blob: str) -> int | None:
    attributes = item.get("attributes")
    if isinstance(attributes, dict):
        for key in ("bedrooms", "bedroom", "beds"):
            beds = parse_int(attributes.get(key))
            if beds:
                return beds
    subtitles = item.get("custom_sub_titles_with_rendering_flags")
    if isinstance(subtitles, list):
        for entry in subtitles:
            if isinstance(entry, dict):
                text = entry.get("subtitle") or entry.get("text")
                if isinstance(text, str):
                    match = BEDS.search(text)
                    if match:
                        return parse_int(match.group(1))
    match = BEDS.search(blob)
    return parse_int(match.group(1)) if match else None


def _sqm(item: dict[str, Any], blob: str) -> float | None:
    attributes = item.get("attributes")
    if isinstance(attributes, dict):
        for key in ("areaSize", "area_size", "squareFeet", "square_feet", "sqm"):
            sqm = parse_number(attributes.get(key))
            if sqm:
                unit = str(attributes.get("areaUnit") or attributes.get("area_unit") or "").lower()
                if "ft" in unit:
                    return round(sqm * 0.092903, 1)
                return sqm
    match = SQM.search(blob)
    return parse_number(match.group(1)) if match else None
