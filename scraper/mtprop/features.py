from __future__ import annotations

import re
from typing import Any

from .localities import fold

FINISH_RANK = {
    "shell": 0,
    "finished": 1,
    "partly_furnished": 2,
    "furnished": 3,
}

_SPACE_FOR_POOL = re.compile(r"\bspace for (?:a )?pool\b|\bpool space\b")
_POOL = re.compile(r"\b(?:swimming |communal |indoor |shared |private )?pool\b")
_SPACE_FOR_LIFT = re.compile(r"\bspace for (?:a )?(?:lift|elevator)\b")
_LIFT = re.compile(r"\b(?:passenger )?lift\b|\belevator\b")
_OPTIONAL_GARAGE = re.compile(r"\boptional garage\b|\bgarage optional\b")
_GARAGE = re.compile(
    r"\b(?:\d+\s*car\s+)?(?:garage|car space|parking space|lock up|lockup)\b",
)


def better_finish(current: str | None, candidate: str | None) -> str | None:
    if candidate is None:
        return current
    if current is None:
        return candidate
    return candidate if FINISH_RANK[candidate] >= FINISH_RANK[current] else current


def parse_finish(text: str | None) -> str | None:
    t = fold(text or "")
    if not t:
        return None
    if re.search(r"\b(?:partly|partially|part)\s+furnished\b", t):
        return "partly_furnished"
    if re.search(r"\bfully\s+furnished\b", t):
        return "furnished"
    if re.search(r"\bunfurnished\b", t):
        if _is_shell(t):
            return "shell"
        return "finished"
    if re.search(r"\bfurnished\b", t):
        return "furnished"
    if _is_shell(t) or re.search(r"\bunfinished\b", t):
        return "shell"
    if re.search(r"\b(?:fully\s+)?finished\b|\bsold finished\b", t):
        return "finished"
    return None


def garage_from_remax(*, includes: Any = None, garage_type: str | None = None, extra_text: str = "") -> bool:
    if includes is True or includes == "true":
        return True
    blob = " ".join(part for part in (garage_type, extra_text) if part)
    t = fold(blob)
    cleaned = _OPTIONAL_GARAGE.sub(" ", t)
    if _GARAGE.search(cleaned):
        return True
    return False


def amenities_from_text(text: str | None, *, complete: bool) -> dict[str, Any]:
    t = fold(text or "")
    out: dict[str, Any] = {}
    finish = parse_finish(t)
    if finish:
        out["finish"] = finish
    pool = _flag(t, _POOL, exclude=_SPACE_FOR_POOL, complete=complete)
    lift = _flag(t, _LIFT, exclude=_SPACE_FOR_LIFT, complete=complete)
    garage = _garage_flag(t, complete=complete)
    if pool is not None:
        out["has_pool"] = pool
    if lift is not None:
        out["has_lift"] = lift
    if garage is not None:
        out["has_garage"] = garage
    return out


def amenities_from_remax_detail(detail: dict[str, Any], *, list_includes: Any = None, list_garage_type: str | None = None) -> dict[str, Any]:
    features = _names(detail.get("Features"))
    inventory = _names(detail.get("Inventory"))
    description = str(detail.get("Description") or "")
    garage_type = detail.get("GarageType") or list_garage_type
    includes = detail.get("PropertyIncludesGarage")
    if includes is None:
        includes = list_includes
    blob = " ".join([*features, description, str(garage_type or "")])
    parsed = amenities_from_text(blob, complete=True)
    finish = parsed.get("finish")
    if inventory:
        finish = better_finish(finish, "partly_furnished")
    parsed["finish"] = finish
    parsed["has_garage"] = garage_from_remax(
        includes=includes,
        garage_type=garage_type,
        extra_text=" ".join([*features, description]),
    )
    parsed["has_pool"] = parsed.get("has_pool", False)
    parsed["has_lift"] = parsed.get("has_lift", False)
    if parsed.get("finish") is None:
        parsed.pop("finish", None)
    return parsed


def _is_shell(text: str) -> bool:
    return bool(re.search(r"\bshell form\b|\bin shell\b|\bshell\b", text)) and "seashell" not in text


def _flag(text: str, positive: re.Pattern[str], *, exclude: re.Pattern[str] | None, complete: bool) -> bool | None:
    cleaned = exclude.sub(" ", text) if exclude else text
    if positive.search(cleaned):
        return True
    return False if complete else None


def _garage_flag(text: str, *, complete: bool) -> bool | None:
    cleaned = _OPTIONAL_GARAGE.sub(" ", text)
    if _GARAGE.search(cleaned):
        return True
    return False if complete else None


def _names(value: Any) -> list[str]:
    if not value:
        return []
    names: list[str] = []
    if not isinstance(value, list):
        return names
    for item in value:
        if isinstance(item, str) and item.strip():
            names.append(item)
        elif isinstance(item, dict):
            name = item.get("Name") or item.get("name")
            if name:
                names.append(str(name))
    return names
