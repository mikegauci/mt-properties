from __future__ import annotations

import json
from typing import Any

import httpx

from .config import DATA_DIR, client, quarter_to_date
from .localities import fetch_locality_ids, seed_localities

EUROSTAT_HPI = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hpi_q"
    "?format=JSON&lang=EN&geo=MT&purchase=TOTAL&unit=I15_Q"
)


def ingest_all() -> dict[str, int]:
    seeded = seed_localities()
    hpi = ingest_eurostat_hpi()
    nso = ingest_nso_bundle()
    return {"localities": seeded, "price_index_rows": hpi, "nso_rows": nso}


def ingest_eurostat_hpi() -> int:
    rows = fetch_eurostat_hpi()
    payload = [
        {
            "source": "nso_rppi",
            "series": "overall",
            "period": quarter_to_date(row["period"]),
            "index_value": row["index_value"],
            "yoy_pct": row["yoy_pct"],
        }
        for row in rows
    ]
    with client() as http:
        response = http.post(
            "/price_indexes",
            params={"on_conflict": "source,series,period"},
            headers={"prefer": "resolution=merge-duplicates,return=minimal"},
            json=payload,
        )
        if response.status_code >= 300:
            raise RuntimeError(f"HPI upsert failed: {response.status_code} {response.text}")
    return len(payload)


def fetch_eurostat_hpi() -> list[dict[str, Any]]:
    try:
        with httpx.Client(timeout=60.0, headers={"user-agent": "mt-properties/1.0"}) as http:
            data = http.get(EUROSTAT_HPI).json()
        time_index = data["dimension"]["time"]["category"]["index"]
        values = data["value"]
        inv = {index: period for period, index in time_index.items()}
        rows = [
            {"period": inv[int(pos)], "index_value": float(value)}
            for pos, value in values.items()
        ]
        rows.sort(key=lambda row: row["period"])
        by_period = {row["period"]: row["index_value"] for row in rows}
        for row in rows:
            year, quarter = row["period"].split("-Q")
            previous = f"{int(year) - 1}-Q{quarter}"
            row["yoy_pct"] = (
                round((row["index_value"] / by_period[previous] - 1) * 100, 2)
                if previous in by_period
                else None
            )
        return rows
    except Exception:
        snapshot = json.loads((DATA_DIR / "eurostat-hpi.json").read_text())
        return snapshot


def ingest_nso_bundle() -> int:
    bundle = json.loads((DATA_DIR / "nso-transactions.json").read_text())
    locality_ids = fetch_locality_ids()
    rows: list[dict[str, Any]] = []

    for item in bundle["national"]:
        rows.append(
            {
                "period": item["period"],
                "period_type": item["period_type"],
                "geography_type": "national",
                "district": None,
                "locality_id": None,
                "deeds": item["deeds"],
                "promise_of_sale": None,
                "total_value": item.get("total_value"),
            }
        )

    period_12m = bundle["localities_12m_period"]
    for item in bundle["districts_12m"]:
        rows.append(
            {
                "period": period_12m,
                "period_type": "year",
                "geography_type": "district",
                "district": item["district"],
                "locality_id": None,
                "deeds": item["deeds"],
                "promise_of_sale": None,
                "total_value": None,
            }
        )

    for item in bundle["localities_12m"]:
        locality_id = locality_ids.get(item["slug"])
        if not locality_id:
            continue
        rows.append(
            {
                "period": period_12m,
                "period_type": "year",
                "geography_type": "locality",
                "district": None,
                "locality_id": locality_id,
                "deeds": item["deeds"],
                "promise_of_sale": None,
                "total_value": None,
            }
        )

    with client() as http:
        for row in rows:
            _upsert_nso_row(http, row)
    return len(rows)


def _upsert_nso_row(http: httpx.Client, row: dict[str, Any]) -> None:
    params: dict[str, str] = {
        "period": f"eq.{row['period']}",
        "period_type": f"eq.{row['period_type']}",
        "geography_type": f"eq.{row['geography_type']}",
        "select": "id",
    }
    if row["geography_type"] == "district":
        params["district"] = f"eq.{row['district']}"
    elif row["geography_type"] == "locality":
        params["locality_id"] = f"eq.{row['locality_id']}"

    existing = http.get("/nso_transactions", params=params).json()
    if existing:
        response = http.patch(
            f"/nso_transactions?id=eq.{existing[0]['id']}",
            json=row,
            headers={"prefer": "return=minimal"},
        )
    else:
        response = http.post(
            "/nso_transactions",
            json=row,
            headers={"prefer": "return=minimal"},
        )
    if response.status_code >= 300:
        raise RuntimeError(f"NSO upsert failed: {response.status_code} {response.text}")
