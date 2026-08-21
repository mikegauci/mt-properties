from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"

load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if not value:
        raise RuntimeError(f"Missing required environment variable {name}")
    return value


def supabase_url() -> str:
    return env("SUPABASE_URL", os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))


def service_key() -> str:
    return env("SUPABASE_SERVICE_ROLE_KEY")


def client() -> httpx.Client:
    return httpx.Client(
        base_url=supabase_url().rstrip("/") + "/rest/v1",
        headers={
            "apikey": service_key(),
            "authorization": f"Bearer {service_key()}",
            "content-type": "application/json",
            "prefer": "return=representation",
        },
        timeout=60.0,
    )


def quarter_to_date(period: str) -> str:
    year, q = period.split("-Q")
    month = {1: "01", 2: "04", 3: "07", 4: "10"}[int(q)]
    return f"{year}-{month}-01"


def iso_today() -> str:
    return date.today().isoformat()


Json = dict[str, Any]
