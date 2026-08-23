from __future__ import annotations

import re
from typing import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..features import amenities_from_text
from ..images import from_card
from ..localities import locality_rows
from .html_pages import yield_paginated_pages
from .http import http_client, page_limit, sleep
from .. import log

SOURCE = "propertymarket"
SITE = "https://www.propertymarket.com.mt"
SEARCH = (
    f"{SITE}/for-sale/?li=&mnp=0&mxp=0&pc=-1&pt=0&nb=0&o=1&d=0&f=&pp={{page}}"
)


def fetch() -> Iterator[dict]:
    with http_client() as http:
        first = http.get(SEARCH.format(page=1))
        first.raise_for_status()
        soup = BeautifulSoup(first.text, "lxml")
        capped = page_limit(_last_page(soup))
        first_items = list(_cards(soup))
    yield from yield_paginated_pages(SOURCE, capped, 1, first_items, _fetch_page)


def _fetch_page(page: int) -> list[dict]:
    sleep()
    with http_client() as http:
        response = http.get(SEARCH.format(page=page))
        response.raise_for_status()
        return list(_cards(BeautifulSoup(response.text, "lxml")))


def _last_page(soup: BeautifulSoup) -> int:
    numbers: list[int] = []
    for link in soup.select('a[href*="pp="]'):
        href = link.get("href") or ""
        numbers.extend(int(match) for match in re.findall(r"[?&]pp=(\d+)", href))
    return max(numbers) if numbers else 1


def _cards(soup: BeautifulSoup) -> Iterator[dict]:
    for node in soup.select(".searchResultListing, .featuredListing"):
        link = node.select_one("a[href*='/view/']")
        if not link:
            continue
        href = link.get("href") or ""
        url = href if href.startswith("http") else urljoin(SITE + "/", href.lstrip("/"))
        external_id = _external_id(url)
        if not external_id:
            continue
        for counter in node.select(".searchResultListingImageCounter"):
            counter.decompose()
        text = " ".join(node.get_text(" ", strip=True).split())
        if re.search(r"\bfor rent\b|\bto let\b", text, re.I):
            continue
        price = _price(text)
        if not price:
            continue
        locality, property_type = _place_type(text)
        amenities = amenities_from_text(text, complete=False)
        yield {
            "external_id": external_id,
            "url": url,
            "locality_name": locality,
            "street": None,
            "property_type": property_type,
            "beds": _beds(text),
            "sqm": _sqm(text),
            "ext_sqm": _ext_sqm(text),
            "price": price,
            "title": text[:180],
            "image_url": from_card(node, SITE),
            "raw": {"href": href, "text": text[:500]},
            **amenities,
        }


def _external_id(url: str) -> str | None:
    match = re.search(r"-(\d{10,})$", url.rstrip("/"))
    return match.group(1) if match else None


def _price(text: str) -> str | None:
    match = re.search(r"€\s*([\d.,]+)", text)
    return match.group(1) if match else None


def _sqm(text: str) -> str | None:
    match = re.search(r"([\d.,]+)\s*(?:m2|m²|sqm)", text, re.I)
    return match.group(1) if match else None


def _ext_sqm(text: str) -> str | None:
    match = re.search(
        r"(?:external(?:\s+area)?|outdoor(?:\s+area)?)\s*[:\-]?\s*([\d.,]+)\s*(?:m2|m²|sqm)",
        text,
        re.I,
    )
    return match.group(1) if match else None


def _beds(text: str) -> str | None:
    match = re.search(r"(\d+)\s*(?:bed|bedroom)", text, re.I)
    return match.group(1) if match else None


def _place_type(text: str) -> tuple[str | None, str | None]:
    types = [
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
    lower = text.lower()
    property_type = next((item for item in types if item.lower() in lower), None)
    locality = None
    for row in locality_rows():
        for alias in [row["name_en"], row["name_mt"], *row.get("aliases", [])]:
            if alias.lower() in lower:
                locality = alias
                break
        if locality:
            break
    return locality, property_type
