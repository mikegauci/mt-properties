from __future__ import annotations

import re
from typing import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..features import amenities_from_text
from ..images import from_card
from ..localities import fold
from .http import http_client, page_limit, sleep
from .. import log

SOURCE = "zanzi"
SITE = "https://www.zanzihomes.com"
SEARCH = f"{SITE}/property-in-malta"
PAGE = f"{SITE}/search/{{page}}"
AJAX_HEADERS = {
    "x-requested-with": "XMLHttpRequest",
    "referer": SEARCH,
    "accept": "text/html, */*;q=0.8",
}

SKIP_NAME = re.compile(
    r"garage|parking|plot|site|airspace|office|shop|warehouse|commercial|land\b",
    re.I,
)


def fetch() -> Iterator[dict]:
    with http_client() as http:
        first = http.get(SEARCH)
        first.raise_for_status()
        soup = BeautifulSoup(first.text, "lxml")
        last = _last_page(http, soup)
        capped = page_limit(last)
        items = list(_cards(soup))
        log.page(SOURCE, 1, capped, len(items))
        yield from items

        for page in range(2, capped + 1):
            sleep()
            response = http.get(PAGE.format(page=page), headers=AJAX_HEADERS)
            response.raise_for_status()
            items = list(_cards(BeautifulSoup(response.text, "lxml")))
            log.page(SOURCE, page, capped, len(items))
            yield from items


def _last_page(http, first_soup: BeautifulSoup) -> int:
    numbers = _pager_numbers(first_soup)
    sleep()
    response = http.get(PAGE.format(page=9999), headers=AJAX_HEADERS)
    response.raise_for_status()
    numbers.extend(_pager_numbers(BeautifulSoup(response.text, "lxml")))
    return max(numbers) if numbers else 1


def _pager_numbers(soup: BeautifulSoup) -> list[int]:
    numbers: list[int] = []
    for node in soup.select(".pager, a[data-url*='/search/']"):
        text = (node.get_text() or "").strip()
        if text.isdigit():
            numbers.append(int(text))
        data = node.get("data-url") or ""
        numbers.extend(int(match) for match in re.findall(r"/search/(\d+)", data))
    return numbers


def _cards(soup: BeautifulSoup) -> Iterator[dict]:
    for node in soup.select(".properties-item"):
        link = node.select_one("a[href*='/property-detail/']")
        if not link:
            continue
        href = link.get("href") or ""
        url = href if href.startswith("http") else urljoin(SITE + "/", href.lstrip("/"))
        ref = _ref(node)
        if not ref:
            continue
        property_type = _text(node.select_one(".apart-name"))
        if property_type and SKIP_NAME.search(fold(property_type)):
            continue
        price = _price(_text(node.select_one(".price")) or "")
        if not price:
            continue
        locality = _locality_name(_city(node))
        sqm = _sqm(_text(node.select_one(".hide-info-prop span")) or "")
        beds = _beds(_bed_text(node))
        text = " ".join(node.get_text(" ", strip=True).split())
        amenities = amenities_from_text(text, complete=False)
        yield {
            "external_id": ref,
            "url": url,
            "locality_name": locality,
            "street": None,
            "property_type": property_type,
            "beds": beds,
            "sqm": sqm,
            "price": price,
            "title": f"{locality or ''} {property_type or ''}".strip() or text[:180],
            "image_url": from_card(node, SITE),
            "raw": {"href": href, "ref": ref, "locality": locality, "text": text[:500]},
            **amenities,
        }


def _ref(node) -> str | None:
    blob = _text(node.select_one(".info-prop")) or ""
    match = re.search(r"REF(?:\s*No\.?)?\s*(\d+)", blob, re.I)
    return match.group(1) if match else None


def _city(node) -> str | None:
    city = node.select_one("a.city")
    if not city:
        return None
    spans = [span.get_text(" ", strip=True) for span in city.select("span") if span.get_text(strip=True)]
    if spans:
        return spans[-1]
    return city.get_text(" ", strip=True) or None


def _bed_text(node) -> str:
    for item in node.select(".flat-info li"):
        text = item.get_text(" ", strip=True)
        if re.search(r"bed", text, re.I):
            return text
    return ""


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


def _text(node) -> str | None:
    if node is None:
        return None
    text = " ".join(node.get_text(" ", strip=True).split())
    return text or None


def _price(text: str) -> str | None:
    match = re.search(r"€\s*([\d.,]+)", text)
    return match.group(1) if match else None


def _sqm(text: str) -> str | None:
    match = re.search(r"([\d.,]+)\s*(?:m2|m²|sqm)", text, re.I)
    return match.group(1) if match else None


def _beds(text: str) -> str | None:
    match = re.search(r"(\d+)\s*(?:bed|bedroom)", text, re.I)
    return match.group(1) if match else None
