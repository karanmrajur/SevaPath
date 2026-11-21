import asyncio
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Request

from app.core.accounts import Account
from app.db.centre_directory import CENTRES

router = APIRouter(prefix="/citizen/centres", tags=["service centres"])


@router.get("")
async def listed_centres(request: Request, account: Account):
    items, dataset = await request.app.state.centre_directory.get()
    return {
        "items": items, "dataset": dataset,
        "mapped_count": sum(item["coordinates"] is not None for item in items),
        "distance_available": bool(request.app.state.settings.maps_geocoding_key),
    }


async def geocode(client: httpx.AsyncClient, centre: dict):
    try:
        response = await client.get("https://geocode.googleapis.com/v4/geocode/address/" + quote(centre["address"], safe=""),
                                    params={"regionCode": "IN"})
        response.raise_for_status()
        for item in response.json().get("results", []):
            if item.get("granularity") not in ("ROOFTOP", "RANGE_INTERPOLATED"):
                continue
            components = {kind: component.get("shortText") for component in item.get("addressComponents", [])
                          for kind in component.get("types", [])}
            if components.get("country") != "IN" or (centre["pin"] and components.get("postal_code") != centre["pin"]):
                continue
            point = item["location"]
            latitude, longitude = float(point["latitude"]), float(point["longitude"])
            if 11 <= latitude <= 19 and 73 <= longitude <= 79:
                return {"id": centre["id"], "latitude": latitude, "longitude": longitude}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return None
    return None


@router.post("/coordinates")
async def centre_coordinates(request: Request, account: Account):
    # Keep the Task 05 API contract for the four original records. The locator
    # uses its own sourced pins, so geocoder results are never mixed with OSM tiles.
    key = request.app.state.settings.maps_geocoding_key
    if not key:
        return []
    request.app.state.map_attempts.consume(request)
    async with httpx.AsyncClient(timeout=4, headers={
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "results.granularity,results.addressComponents,results.location",
    }) as client:
        results = await asyncio.gather(*(geocode(client, centre) for centre in CENTRES))
    return [point for point in results if point is not None]
