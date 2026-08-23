from __future__ import annotations

import json
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import DATA_DIR, client


@lru_cache(maxsize=1)
def property_type_config() -> dict[str, Any]:
    return json.loads((DATA_DIR / "property-types.json").read_text())


@lru_cache(maxsize=1)
def area_fold_config() -> dict[str, Any]:
    return json.loads((DATA_DIR / "area-fold.json").read_text())


@lru_cache(maxsize=1)
def type_alias_map() -> dict[str, str]:
    return {fold(key): value for key, value in property_type_config().get("aliases", {}).items()}


@lru_cache(maxsize=1)
def type_skip_set() -> set[str]:
    return {fold(item) for item in property_type_config().get("skipTypes", [])}


def fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return " ".join(ascii_only.lower().replace("'", " ").replace("-", " ").split())


def fold_loose(value: str) -> str:
    cleaned = fold(value)
    for char in ".,/;:()":
        cleaned = cleaned.replace(char, " ")
    return " ".join(cleaned.split())


def fold_area(value: str) -> str:
    replacements = area_fold_config().get("wordReplacements", {})
    words: list[str] = []
    for word in fold_loose(value).split():
        words.append(replacements.get(word, word))
    return " ".join(words)


@lru_cache(maxsize=1)
def locality_rows() -> list[dict[str, Any]]:
    path = DATA_DIR / "localities.json"
    return json.loads(path.read_text())


def load_alias_map() -> dict[str, str]:
    mapping: dict[str, str] = {}
    for row in locality_rows():
        mapping[fold(row["name_en"])] = row["slug"]
        mapping[fold(row["name_mt"])] = row["slug"]
        mapping[fold(row["slug"].replace("-", " "))] = row["slug"]
        for alias in row.get("aliases", []):
            mapping[fold(alias)] = row["slug"]
    return mapping


@lru_cache(maxsize=1)
def area_maps() -> dict[str, list[tuple[str, str]]]:
    out: dict[str, list[tuple[str, str]]] = {}
    for row in locality_rows():
        areas = [name for name in row.get("areas") or [] if name]
        pairs: dict[str, str] = {}
        for name in areas:
            pairs[fold_area(name)] = name
        official = {
            fold_area(row["name_en"]),
            fold_area(row["name_mt"]),
            fold_area(row["slug"].replace("-", " ")),
        }
        area_items = sorted(areas, key=lambda name: len(fold_area(name)), reverse=True)
        for alias in row.get("aliases", []):
            key = fold_area(alias)
            if not key or key in pairs or key in official:
                continue
            for name in area_items:
                folded = fold_area(name)
                if _contains_key(key, folded):
                    pairs[key] = name
                    break
        out[row["slug"]] = sorted(pairs.items(), key=lambda item: len(item[0]), reverse=True)
    return out


def _contains_key(haystack: str, needle: str) -> bool:
    if not needle:
        return False
    padded = f" {haystack} "
    return padded.startswith(f" {needle} ") or f" {needle} " in padded


def match_area(slug: str | None, *values: str | None) -> str | None:
    if not slug:
        return None
    entries = area_maps().get(slug) or []
    if not entries:
        return None
    for value in values:
        if not value:
            continue
        key = fold_area(str(value))
        if not key:
            continue
        for folded, canonical in entries:
            if key == folded:
                return canonical
        for folded, canonical in entries:
            if _contains_key(key, folded):
                return canonical
    return None


def match_locality(name: str | None) -> str | None:
    if not name:
        return None
    mapping = load_alias_map()
    key = fold(name)
    if key in mapping:
        return mapping[key]
    stripped = fold(name.split(",")[0].split("(")[0])
    if stripped in mapping:
        return mapping[stripped]
    for alias, slug in mapping.items():
        if key.startswith(alias + " ") or f" {alias} " in f" {key} ":
            return slug
    return None


def normalize_type(raw: str | None) -> str | None:
    if not raw:
        return None
    key = fold(raw)
    if key in type_skip_set():
        return None
    aliases = type_alias_map()
    if key in aliases:
        return aliases[key]
    underscored = key.replace(" ", "_")
    for rule in property_type_config().get("prefixRules", []):
        if underscored.startswith(rule["prefix"]):
            return rule["type"]
    if "character" in underscored:
        return "house_of_character"
    return underscored


def fingerprint(locality_slug: str | None, property_type: str | None, sqm: float | None, street: str | None) -> str | None:
    if not locality_slug or not property_type:
        return None
    rounded = int(round(float(sqm) / 10) * 10) if sqm else 0
    tokens = [t for t in fold(street or "").split() if len(t) > 2][:2]
    street_part = "-".join(tokens) if tokens else "na"
    return f"{locality_slug}|{property_type}|{rounded}|{street_part}"


def fetch_locality_ids() -> dict[str, str]:
    with client() as http:
        rows = http.get("/localities", params={"select": "id,slug", "limit": "200"}).json()
    if isinstance(rows, dict) and rows.get("message"):
        raise RuntimeError(f"Supabase localities fetch failed: {rows}")
    return {row["slug"]: row["id"] for row in rows}


def seed_localities() -> int:
    payload = [
        {
            "slug": row["slug"],
            "name_en": row["name_en"],
            "name_mt": row["name_mt"],
            "district": row["district"],
            "island": row["island"],
            "aliases": row.get("aliases", []),
        }
        for row in locality_rows()
    ]
    with client() as http:
        response = http.post(
            "/localities",
            params={"on_conflict": "slug"},
            headers={"prefer": "resolution=merge-duplicates,return=minimal"},
            json=payload,
        )
        if response.status_code >= 300:
            raise RuntimeError(f"Seed localities failed: {response.status_code} {response.text}")
    return len(payload)


def data_path(name: str) -> Path:
    return DATA_DIR / name
