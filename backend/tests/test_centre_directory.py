import asyncio
from collections import Counter

import httpx

from app.db import centre_directory as directory
from test_citizen import ROOT, register


def test_snapshot_contains_only_sourced_records_and_unique_sites(client):
    assert client.get(ROOT + "/centres").status_code == 401
    assert register(client).status_code == 201
    response = client.get(ROOT + "/centres")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    data = response.json()
    items = data["items"]
    counts = Counter(row["centre_type"] for row in items)
    assert {"Bangalore One", "Karnataka One", "Grama One", "Seva Sindhu", "Other citizen service centre"} == counts.keys()
    assert len(items) > 240 and len({row["id"] for row in items}) == len(items)
    assert sum(row["coordinates"] is not None for row in items) == data["mapped_count"] == 4
    assert all(row["verified_on"] and row["source"].startswith("https://") for row in items)
    assert any(row["pin"] == "580001" and row["id"] == "kalabhavan" for row in items)
    assert {row["coordinates"]["confidence"] for row in items if row["coordinates"]} == {"official_site", "matched_site"}


def test_upstream_blank_and_invalid_points_do_not_create_pins():
    group = directory.SLICES[1]
    row = {"kiosk_name": "Sample", "Center_name": "Kone", "isactive": True,
           "Center_Address": "Phase 3, Station Road 580001Ph.No:0836-2444098.",
           "Lattitude": "0", "Longitude": "0"}
    result = directory.centre_from_row(row, group, "2026-11-21")
    assert result["address"] == "Phase 3, Station Road 580001"
    assert result["pin"] == "580001"
    assert result["phone"] == "0836-2444098"
    assert result["coordinates"] is None
    assert directory.centre_from_row({**row, "isactive": False}, group, "2026-11-21") is None


def test_directory_refresh_caches_partial_success_and_keeps_fallback(monkeypatch):
    calls = []

    async def fake_fetch(client, group):
        calls.append(group)
        if group != directory.SLICES[0]:
            return None
        return directory_snapshot.snapshot[",".join(group)]

    directory_snapshot = directory.CentreDirectory(live=True)
    monkeypatch.setattr(directory, "fetch_slice", fake_fetch)

    async def run():
        first, mode = await directory_snapshot.get()
        assert mode == "mixed"
        assert len(first) == len(directory.CentreDirectory(live=False).items)
        second, mode = await directory_snapshot.get()
        assert first is second and mode == "mixed"

    asyncio.run(run())
    assert calls == list(directory.SLICES)


def test_fetch_uses_only_government_query_and_parses_double_encoded_body():
    group = directory.SLICES[0]

    def handler(request):
        assert request.url.host == "sevasindhu.karnataka.gov.in"
        assert request.url.params["Selecteddata"] == ",".join(group)
        assert set(request.url.params) == {"Selecteddata"}
        return httpx.Response(200, json='{"TblAllDataByCenterDistricAndTaluk": []}')

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert await directory.fetch_slice(client, group) is None

    asyncio.run(run())
