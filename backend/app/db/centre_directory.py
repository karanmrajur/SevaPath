"""Sourced Seva Sindhu listings, disjoint from the citizen database."""
import asyncio
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from time import monotonic

import httpx

DIRECTORY = "https://sevasindhu.karnataka.gov.in/Sevasindhu/Servicecenters"
FEED = "https://sevasindhu.karnataka.gov.in/api/servicecenters/getalldatabycenteranddistric"
TYPES = {"Bone": "Bangalore One", "Kone": "Karnataka One", "Gramaone": "Grama One"}
SLICES = (
    ("Bone", "null", "null"), ("Kone", "null", "null"),
    ("Gramaone", "Kodagu", "Madikeri"), ("Gramaone", "Kodagu", "Somvarpet"), ("Gramaone", "Kodagu", "Virajpet"),
)
DIRECTORY_TTL = 6 * 60 * 60
RETRY_TTL = 10 * 60
OFFICIAL_FALLBACK_DATE = "2026-11-21"
DATA = Path(__file__).parent
DHARWAD = "https://dharwad.nic.in/en/service/pay-your-bills/"
KODAGU = "https://kodagu.nic.in/en/seva-sindhu-kendra/"
BENGALURU = "https://bengaluruurban.nic.in/en/service/seva-sindhu/"
PIN = re.compile(r"(?<!\d)[1-9]\d{5}(?!\d)")

CENTRES = (
    {"id": "glass-house", "name": "Karnataka One Glass House", "address": "Zone 9, near Sujata Talkies, Hubballi 580024, Karnataka",
     "city": "Hubballi / Hubli", "district": "Dharwad", "pin": "580024", "operator": None, "phone": "0836-2362880",
     "source": DHARWAD, "centre_type": "Karnataka One", "aliases": ["Indira Glass Compound"]},
    {"id": "kalabhavan", "name": "Karnataka One Kalabhavan", "address": "First floor, Zone 12, Belagavi Road, Dharwad 580001, Karnataka",
     "city": "Dharwad", "district": "Dharwad", "pin": "580001", "operator": None, "phone": "0836-2362880",
     "source": DHARWAD, "centre_type": "Karnataka One", "aliases": ["Kala Bhavan"]},
    {"id": "aiyamgeri", "name": "GramaOne Aiyamgeri", "address": "Near Juma Masjid, Aiyangeri, Madikeri taluk, Kodagu, Karnataka",
     "city": "Madikeri", "district": "Kodagu", "pin": None, "operator": "Abbas B H", "phone": "6361738143",
     "source": KODAGU, "centre_type": "Grama One", "aliases": ["Aiyamgeri", "Aiyangeri"]},
    {"id": "ballamavati", "name": "GramaOne Ballamavati", "address": "Ballamavathi village, Madikeri taluk, Kodagu, Karnataka",
     "city": "Madikeri", "district": "Kodagu", "pin": None, "operator": "Kaverie CK", "phone": "9449542066",
     "source": KODAGU, "centre_type": "Grama One", "aliases": ["Ballamavathi"]},
)
SUPPLEMENTAL = CENTRES + (
    {"id": "seva-sindhu-directorate", "name": "Seva Sindhu Citizen Services Directorate",
     "address": "2nd floor, CRN Chambers, Kasturba Road, Bengaluru 560001, Karnataka", "city": "Bengaluru",
     "district": "Bengaluru Urban", "pin": "560001", "operator": None, "phone": "080-22279954",
     "source": BENGALURU, "centre_type": "Seva Sindhu", "aliases": ["Bangalore", "EDCS"]},
    {"id": "ajsk-directorate", "name": "Atalji Janasnehi Kendra Directorate",
     "address": "SSLR Building, K. R. Circle, Bengaluru 560001, Karnataka", "city": "Bengaluru",
     "district": "Bengaluru Urban", "pin": "560001", "operator": None, "phone": "080-22214550",
     "source": "https://kalaburagi.nic.in/en/service/nada-kacheri/", "centre_type": "Other citizen service centre",
     "aliases": ["Bangalore", "Nada Kacheri", "AJSK"]},
)


def clean(value) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def normalized(text: str) -> str:
    return "".join(character for character in text.casefold() if character.isalnum())


def site_key(entry):
    address = re.sub(r"\b(?:1st|first)\s+floor\b", "", entry["address"], flags=re.I)
    return entry["centre_type"], normalized(address)


def phone_number(value):
    text = clean(value)
    digits = re.sub(r"\D", "", text)
    if re.fullmatch(r"\+?[0-9() -]+", text) and 10 <= len(digits) <= 13 and len(set(digits)) > 1:
        return text
    return None


def centre_from_row(row: dict, group: tuple[str, str, str], checked: str):
    code, listed_district, listed_taluk = group
    if row.get("Center_name") != code or row.get("isactive") is not True:
        return None
    kiosk = clean(row.get("kiosk_name"))
    address = clean(row.get("Center_Address"))
    if not kiosk or not address or len(kiosk) > 160 or len(address) > 420:
        return None
    # The urban feed sometimes appends a phone to the postal address.
    split = re.split(r"(?<=\d)\s*ph(?:one)?(?:\s*\.?\s*no)?[\s.:]+", address, maxsplit=1, flags=re.I)
    address, embedded_phone = split if len(split) == 2 else (address, "")
    address = address.strip(" ,;")
    phone = phone_number(row.get("Mobile_no")) or phone_number(embedded_phone.strip(" ."))
    pin = PIN.search(clean(row.get("pincode"))) or PIN.search(address)
    district = clean(row.get("District"))
    if not normalized(district) or "select" == normalized(district):
        district = "Bengaluru" if code == "Bone" else "" if listed_district == "null" else listed_district
    taluk = clean(row.get("Taluk"))
    city = "Bengaluru" if code == "Bone" else taluk or ("" if listed_taluk == "null" else listed_taluk)
    aliases = [kiosk]
    if code == "Bone":
        aliases.extend(["Bangalore", "Bengaluru Urban"])
    if "dharwad" in district.casefold():
        aliases.extend(["Dharwad", "Hubli", "Hubballi"])
    name = f"{TYPES[code]} · {kiosk}"
    digest = sha256((code + "|" + normalized(kiosk) + "|" + normalized(address)).encode()).hexdigest()
    coordinates = None
    try:
        latitude, longitude = float(row["Lattitude"]), float(row["Longitude"])
        if 11 <= latitude <= 19 and 73 <= longitude <= 79:
            coordinates = {"latitude": latitude, "longitude": longitude, "confidence": "official_site", "source": DIRECTORY}
    except (ValueError, TypeError, KeyError):
        pass
    return {"id": "directory-" + digest[:20], "name": name, "address": address, "source": DIRECTORY,
            "centre_type": TYPES[code], "aliases": aliases, "city": city, "district": district,
            "phone": phone, "operator": None, "pin": pin[0] if pin else None,
            "verified_on": checked, "coordinates": coordinates}


def skip_duplicate(entry):
    name, address = normalized(entry["name"]), normalized(entry["address"])
    if entry["centre_type"] == "Karnataka One" and "dharwad" in (entry["district"] + entry["address"]).casefold():
        return name.endswith(("glasshouse", "kalabhavan", "kalabhavanazone12"))
    return entry["centre_type"] == "Grama One" and entry["district"].casefold() == "kodagu" and any(
        locality in address for locality in ("ballamavathi", "ballamavati", "aiyangeri", "aiyamgeri")
    )


def combine(slices, matches):
    by_site = {}
    for row in SUPPLEMENTAL:
        entry = {**row, "verified_on": OFFICIAL_FALLBACK_DATE, "coordinates": None}
        by_site[site_key(entry)] = entry
    for entry in (row for records in slices.values() for row in records):
        if skip_duplicate(entry):
            continue
        key = site_key(entry)
        if key not in by_site:
            by_site[key] = entry
    result = []
    for entry in by_site.values():
        pin = matches.get(entry["id"])
        # Matched pins are keyed by the original listing ID, which contains its address.
        if pin:
            entry = {**entry, "pin": entry["pin"] or pin.get("pin")}
            pin = {key: value for key, value in pin.items() if key != "pin"}
        result.append({**entry, "coordinates": entry["coordinates"] or pin})
    return result


async def fetch_slice(client: httpx.AsyncClient, group: tuple[str, str, str]):
    try:
        response = await client.get(FEED, params={"Selecteddata": ",".join(group)})
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, str):
            payload = json.loads(payload)
        checked = datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
        records = [entry for row in payload["TblAllDataByCenterDistricAndTaluk"] if isinstance(row, dict)
                   if (entry := centre_from_row(row, group, checked)) is not None]
        return records or None
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        return None


class CentreDirectory:
    def __init__(self, live: bool):
        self.live = live
        self.snapshot = json.loads((DATA / "centre_snapshot.json").read_text(encoding="utf-8"))
        self.coordinates = json.loads((DATA / "centre_coordinates.json").read_text(encoding="utf-8"))
        self.records = self.snapshot.copy()
        self.mode = "sourced_snapshot"
        self.expires = 0.0
        self.lock = asyncio.Lock()
        self.items = combine(self.records, self.coordinates)

    async def get(self):
        if self.live and monotonic() >= self.expires:
            async with self.lock:
                if monotonic() >= self.expires:
                    await self.refresh()
        return self.items, self.mode

    async def refresh(self):
        async with httpx.AsyncClient(timeout=4, limits=httpx.Limits(max_connections=5)) as client:
            results = await asyncio.gather(*(fetch_slice(client, group) for group in SLICES))
        refreshed = dict(zip(map(",".join, SLICES), results))
        self.records.update({group: rows for group, rows in refreshed.items() if rows})
        available = sum(bool(rows) for rows in results)
        if available:
            self.mode = "official_feed" if available == len(SLICES) else "mixed"
        elif self.mode != "sourced_snapshot":
            self.mode = "cached_feed"
        self.items = combine(self.records, self.coordinates)
        self.expires = monotonic() + (DIRECTORY_TTL if available == len(SLICES) else RETRY_TTL)


async def write_snapshot():
    async with httpx.AsyncClient(timeout=12, limits=httpx.Limits(max_connections=5)) as client:
        results = await asyncio.gather(*(fetch_slice(client, group) for group in SLICES))
    if not all(results):
        raise SystemExit("At least one official directory group was unavailable. Snapshot unchanged.")
    snapshot = dict(zip(map(",".join, SLICES), results))
    (DATA / "centre_snapshot.json").write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {sum(map(len, results))} normalized official listings.")


if __name__ == "__main__":
    asyncio.run(write_snapshot())
