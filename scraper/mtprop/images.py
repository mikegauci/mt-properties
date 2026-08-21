from __future__ import annotations

from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

_SKIP = ("logo", "lazy-img", ".svg", "placeholder", "spacer", "pixel.gif", "facebook.com/tr", "contact-us")
_LISTING_HINTS = ("/listings/", "/uploads/property/", "jade.uptech.mt")


def from_card(node, site: str) -> str | None:
    for img in node.select("img"):
        raw = img.get("data-original") or img.get("data-src") or img.get("src")
        url = absolute(raw, site)
        if url:
            return url
    return None


def from_html(html: str, site: str) -> str | None:
    soup = BeautifulSoup(html, "lxml")
    candidates: list[str] = []
    for prop in ("og:image", "og:image:url", "twitter:image"):
        tag = soup.select_one(f'meta[property="{prop}"], meta[name="{prop}"]')
        content = tag.get("content") if tag else None
        if content:
            candidates.append(content)
    for img in soup.select("img"):
        raw = img.get("data-original") or img.get("data-src") or img.get("src")
        if raw:
            candidates.append(raw)
    listing_like: list[str] = []
    other: list[str] = []
    for raw in candidates:
        url = absolute(raw, site)
        if not url:
            continue
        low = url.lower()
        if any(hint in low for hint in _LISTING_HINTS):
            listing_like.append(url)
        else:
            other.append(url)
    thumbs = [url for url in listing_like if "/thumbnail/" in url.lower()]
    if thumbs:
        return thumbs[0]
    if listing_like:
        return listing_like[0]
    return other[0] if other else None


def site_from_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return url


def absolute(src: object, site: str | None = None) -> str | None:
    if not isinstance(src, str):
        return None
    text = src.strip()
    if not text:
        return None
    lower = text.lower()
    if any(token in lower for token in _SKIP):
        return None
    if text.startswith("//"):
        text = "https:" + text
    elif text.startswith("/"):
        if not site:
            return None
        text = urljoin(site.rstrip("/") + "/", text.lstrip("/"))
    elif not text.startswith("http"):
        return None
    return text
