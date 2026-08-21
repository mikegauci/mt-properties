from __future__ import annotations

from urllib.parse import urljoin

_SKIP = ("logo", "lazy-img", ".svg", "placeholder", "spacer", "pixel.gif")


def from_card(node, site: str) -> str | None:
    for img in node.select("img"):
        raw = img.get("data-original") or img.get("data-src") or img.get("src")
        url = absolute(raw, site)
        if url:
            return url
    return None


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
