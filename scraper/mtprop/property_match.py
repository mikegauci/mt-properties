from __future__ import annotations

import statistics
import time
from datetime import datetime, timezone
from typing import Any

from .config import client
from .localities import fold, fold_area, match_block
from .supabase_rows import FLUSH_SIZE, all_rows as _all_rows, chunks


MATCH_THRESHOLD = 0.85
SOURCE_PRIORITY = {"remax": 4, "propertymarket": 3, "zanzi": 2, "facebook": 1}

MATCH_LISTING_COLUMNS = (
    "id,source,external_id,locality_id,property_type,beds,sqm,ext_sqm,street,area,"
    "price,title,image_url,property_id,match_block"
)


def _title_tokens(title: str | None) -> set[str]:
    if not title:
        return set()
    stop = {"for", "sale", "rent", "with", "and", "the", "in", "at", "a", "an", "of", "to"}
    return {token for token in fold(title).split() if len(token) > 2 and token not in stop}


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    union = left | right
    if not union:
        return 0.0
    return len(left & right) / len(union)


def _within_tolerance(left: float, right: float, pct: float, abs_min: float) -> bool:
    if left <= 0 or right <= 0:
        return False
    delta = max(abs_min, max(left, right) * pct)
    return abs(left - right) <= delta


def _street_overlap(left: str | None, right: str | None) -> float:
    tokens_left = {token for token in fold(left or "").split() if len(token) > 2}
    tokens_right = {token for token in fold(right or "").split() if len(token) > 2}
    return _jaccard(tokens_left, tokens_right)


def score_pair(left: dict[str, Any], right: dict[str, Any]) -> float:
    image_left = left.get("image_url")
    image_right = right.get("image_url")
    if image_left and image_right and image_left == image_right:
        return 1.0

    if left.get("locality_id") != right.get("locality_id"):
        return 0.0
    if left.get("property_type") != right.get("property_type"):
        return 0.0

    beds_left = left.get("beds")
    beds_right = right.get("beds")
    if beds_left is not None and beds_right is not None and beds_left != beds_right:
        return 0.0

    score = 0.0
    weight = 0.0

    sqm_left = left.get("sqm")
    sqm_right = right.get("sqm")
    if sqm_left and sqm_right:
        weight += 0.25
        if _within_tolerance(float(sqm_left), float(sqm_right), 0.05, 5):
            score += 0.25
        elif _within_tolerance(float(sqm_left), float(sqm_right), 0.10, 10):
            score += 0.15

    price_left = left.get("price")
    price_right = right.get("price")
    if price_left and price_right:
        weight += 0.25
        if _within_tolerance(float(price_left), float(price_right), 0.10, 0):
            score += 0.25
        elif _within_tolerance(float(price_left), float(price_right), 0.15, 0):
            score += 0.15

    area_left = left.get("area")
    area_right = right.get("area")
    if area_left and area_right:
        weight += 0.20
        folded_left = fold_area(str(area_left))
        folded_right = fold_area(str(area_right))
        if folded_left == folded_right:
            score += 0.20
        elif folded_left in folded_right or folded_right in folded_left:
            score += 0.12

    street_left = left.get("street")
    street_right = right.get("street")
    if street_left and street_right:
        weight += 0.15
        score += 0.15 * _street_overlap(str(street_left), str(street_right))

    title_left = left.get("title")
    title_right = right.get("title")
    if title_left and title_right:
        weight += 0.15
        score += 0.15 * _jaccard(_title_tokens(str(title_left)), _title_tokens(str(title_right)))

    if weight == 0:
        return 0.0
    return score / weight


class UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, index: int) -> int:
        while self.parent[index] != index:
            self.parent[index] = self.parent[self.parent[index]]
            index = self.parent[index]
        return index

    def union(self, left: int, right: int) -> None:
        root_left = self.find(left)
        root_right = self.find(right)
        if root_left == root_right:
            return
        if self.rank[root_left] < self.rank[root_right]:
            self.parent[root_left] = root_right
        elif self.rank[root_left] > self.rank[root_right]:
            self.parent[root_right] = root_left
        else:
            self.parent[root_right] = root_left
            self.rank[root_left] += 1


def cluster_block(rows: list[dict[str, Any]], threshold: float = MATCH_THRESHOLD) -> list[list[dict[str, Any]]]:
    size = len(rows)
    if size == 0:
        return []
    if size == 1:
        return [rows]
    union_find = UnionFind(size)
    for left in range(size):
        for right in range(left + 1, size):
            if score_pair(rows[left], rows[right]) >= threshold:
                union_find.union(left, right)
    groups: dict[int, list[dict[str, Any]]] = {}
    for index in range(size):
        root = union_find.find(index)
        groups.setdefault(root, []).append(rows[index])
    return list(groups.values())


def listing_quality(row: dict[str, Any]) -> tuple[int, int, int, int]:
    source_rank = SOURCE_PRIORITY.get(str(row.get("source") or ""), 0)
    return (
        1 if row.get("street") else 0,
        1 if row.get("beds") else 0,
        1 if row.get("sqm") else 0,
        source_rank,
    )


def pick_primary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return max(rows, key=listing_quality)


def median_price(rows: list[dict[str, Any]]) -> float | None:
    prices = [float(row["price"]) for row in rows if row.get("price") and float(row["price"]) > 0]
    if not prices:
        return None
    return float(statistics.median(prices))


def property_payload_from_cluster(rows: list[dict[str, Any]], block_key: str) -> dict[str, Any]:
    primary = pick_primary(rows)
    return {
        "locality_id": primary.get("locality_id"),
        "property_type": primary.get("property_type"),
        "beds": primary.get("beds"),
        "sqm": primary.get("sqm"),
        "ext_sqm": primary.get("ext_sqm"),
        "street": primary.get("street"),
        "area": primary.get("area"),
        "price_median": median_price(rows),
        "primary_listing_id": primary.get("id"),
        "match_block": block_key,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def find_best_match(
    row: dict[str, Any],
    candidates: list[dict[str, Any]],
    threshold: float = MATCH_THRESHOLD,
) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_score = threshold
    for candidate in candidates:
        if candidate.get("id") == row.get("id"):
            continue
        current = score_pair(row, candidate)
        if current >= best_score:
            best_score = current
            best = candidate
    return best


def compute_match_block(row: dict[str, Any]) -> str | None:
    return match_block(
        row.get("locality_id"),
        row.get("property_type"),
        row.get("beds"),
        row.get("sqm"),
        row.get("area"),
    )


def _create_properties(http, payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not payloads:
        return []
    response = http.post(
        "/properties",
        headers={"prefer": "return=representation"},
        json=payloads,
    )
    if response.status_code >= 300:
        raise RuntimeError(f"Property insert failed: {response.status_code} {response.text}")
    return response.json()


def _patch_listings(http, updates: list[tuple[str, str, str]]) -> None:
    for listing_id, property_id, block_key in updates:
        response = http.patch(
            f"/listings?id=eq.{listing_id}",
            json={"property_id": property_id, "match_block": block_key},
            headers={"prefer": "return=minimal"},
        )
        if response.status_code >= 300:
            raise RuntimeError(f"Listing property link failed: {response.status_code} {response.text}")


def _patch_properties(http, updates: list[tuple[str, dict[str, Any]]]) -> None:
    for property_id, payload in updates:
        response = http.patch(
            f"/properties?id=eq.{property_id}",
            json=payload,
            headers={"prefer": "return=minimal"},
        )
        if response.status_code >= 300:
            raise RuntimeError(f"Property update failed: {response.status_code} {response.text}")


def _load_block_candidates(http, block_key: str, limit: int = 50) -> list[dict[str, Any]]:
    response = http.get(
        "/listings",
        params={
            "select": MATCH_LISTING_COLUMNS,
            "match_block": f"eq.{block_key}",
            "is_active": "eq.true",
            "limit": str(limit),
        },
    )
    if response.status_code >= 300:
        raise RuntimeError(f"Block candidate lookup failed: {response.status_code} {response.text}")
    return response.json()


def assign_property_for_row(http, row: dict[str, Any], now: str | None = None) -> str | None:
    block_key = compute_match_block(row)
    if not block_key:
        return None
    row = {**row, "match_block": block_key}
    candidates = _load_block_candidates(http, block_key)
    matched = find_best_match(row, candidates)
    if matched and matched.get("property_id"):
        listing_id = row.get("id")
        if listing_id:
            _patch_listings(http, [(listing_id, matched["property_id"], block_key)])
        return matched["property_id"]

    primary_id = row.get("id")
    payload = property_payload_from_cluster([row], block_key)
    if primary_id:
        payload["primary_listing_id"] = primary_id
    if now:
        payload["created_at"] = now
    created = _create_properties(http, [payload])[0]
    property_id = created["id"]
    if primary_id:
        _patch_listings(http, [(primary_id, property_id, block_key)])
    return property_id


def assign_properties_for_rows(http, rows: list[dict[str, Any]], saved: list[dict[str, Any]]) -> None:
    if not saved:
        return
    saved_by_external: dict[str, dict[str, Any]] = {
        str(row["external_id"]): row for row in saved if row.get("external_id")
    }
    property_updates: list[tuple[str, dict[str, Any]]] = {}
    for row in rows:
        saved_row = saved_by_external.get(str(row["external_id"]))
        if not saved_row or not saved_row.get("id"):
            continue
        merged = {**row, "id": saved_row["id"]}
        block_key = compute_match_block(merged)
        if not block_key:
            continue
        merged["match_block"] = block_key
        candidates = _load_block_candidates(http, block_key)
        matched = find_best_match(merged, candidates)
        if matched and matched.get("property_id"):
            property_id = matched["property_id"]
            _patch_listings(http, [(saved_row["id"], property_id, block_key)])
            cluster_rows = [candidate for candidate in candidates if candidate.get("property_id") == property_id]
            cluster_rows.append(merged)
            property_updates[property_id] = property_payload_from_cluster(cluster_rows, block_key)
            continue
        payload = property_payload_from_cluster([merged], block_key)
        payload["primary_listing_id"] = saved_row["id"]
        created = _create_properties(http, [payload])[0]
        _patch_listings(http, [(saved_row["id"], created["id"], block_key)])

    if property_updates:
        _patch_properties(http, list(property_updates.items()))


def run_match_properties() -> dict[str, Any]:
    started = time.monotonic()
    with client() as http:
        reset = http.delete(
            "/properties",
            params={"id": "not.is.null"},
            headers={"prefer": "return=minimal"},
        )
        if reset.status_code >= 300:
            raise RuntimeError(f"Property reset failed: {reset.status_code} {reset.text}")

        rows = _all_rows(
            http,
            "/listings",
            {
                "select": MATCH_LISTING_COLUMNS,
                "is_active": "eq.true",
                "order": "match_block,id",
            },
        )

        for row in rows:
            row["match_block"] = compute_match_block(row)

        blocks: dict[str, list[dict[str, Any]]] = {}
        orphans: list[dict[str, Any]] = []
        for row in rows:
            block_key = row.get("match_block")
            if not block_key:
                orphans.append(row)
                continue
            blocks.setdefault(block_key, []).append(row)

        properties_created = 0
        listings_linked = 0
        mega_clusters = 0
        cluster_sizes: list[int] = []

        for block_key, block_rows in blocks.items():
            clusters = cluster_block(block_rows)
            if len(block_rows) > 10:
                mega_clusters += 1
            for cluster in clusters:
                cluster_sizes.append(len(cluster))
                payload = property_payload_from_cluster(cluster, block_key)
                created = _create_properties(http, [payload])[0]
                property_id = created["id"]
                properties_created += 1
                updates = [(str(row["id"]), property_id, block_key) for row in cluster if row.get("id")]
                for chunk in chunks(updates, FLUSH_SIZE):
                    for listing_id, linked_property_id, linked_block in chunk:
                        response = http.patch(
                            f"/listings?id=eq.{listing_id}",
                            json={"property_id": linked_property_id, "match_block": linked_block},
                            headers={"prefer": "return=minimal"},
                        )
                        if response.status_code >= 300:
                            raise RuntimeError(
                                f"Listing property link failed: {response.status_code} {response.text}"
                            )
                        listings_linked += 1

        for row in orphans:
            if not row.get("id"):
                continue
            payload = property_payload_from_cluster([row], "orphan")
            payload["match_block"] = None
            created = _create_properties(http, [payload])[0]
            properties_created += 1
            response = http.patch(
                f"/listings?id=eq.{row['id']}",
                json={"property_id": created["id"]},
                headers={"prefer": "return=minimal"},
            )
            if response.status_code >= 300:
                raise RuntimeError(f"Orphan listing link failed: {response.status_code} {response.text}")
            listings_linked += 1

        avg_cluster = sum(cluster_sizes) / len(cluster_sizes) if cluster_sizes else 0.0
        multi_listing_clusters = sum(1 for size in cluster_sizes if size > 1)

        return {
            "listings_processed": len(rows),
            "blocks_processed": len(blocks),
            "properties_created": properties_created,
            "listings_linked": listings_linked,
            "orphans": len(orphans),
            "mega_clusters": mega_clusters,
            "multi_listing_clusters": multi_listing_clusters,
            "avg_cluster_size": round(avg_cluster, 2),
            "duration_seconds": round(time.monotonic() - started, 1),
        }
