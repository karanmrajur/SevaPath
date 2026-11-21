import asyncio
from base64 import b64encode
from datetime import timedelta

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.citizen_models import AccountSession, CitizenAccount, CitizenFile
from app.db.encrypt_wallet import encrypt_legacy_files
from app.db.catalogue_seed import seed_catalogue
from app.db.models import now_utc
from app.routers.centres import CENTRES, geocode
from app.schemas.citizen import today_india
from test_citizen import PNG, PASSWORD, ROOT, register, unlock, upload


def photo_body():
    return {"name": "photo.png", "category": "Passport-size Photograph", "mime": "image/png",
            "content": b64encode(PNG).decode(), "consent": True}


def test_profile_contacts_sensitive_fields_and_photo(client, engine):
    assert register(client).status_code == 201
    assert client.patch(ROOT + "/profile", json={"caste": "example", "consent": True}).status_code == 422
    assert client.patch(ROOT + "/profile", json={"date_of_birth": "2999-01-01", "consent": True}).status_code == 422
    assert client.patch(ROOT + "/profile", json={"pin_code": "000001", "consent": True}).status_code == 422
    updated = client.patch(ROOT + "/profile", json={
        "first_name": "Asha", "surname": "Test", "date_of_birth": "2000-01-01", "pin_code": "560001",
        "temporary_address": "discarded address", "permanent_address": "private address",
        "same_as_permanent": True, "consent": True,
    })
    assert updated.status_code == 200
    profile = updated.json()["profile"]
    assert profile["age"] == today_india().year - 2000
    assert profile["temporary_address"] == ""
    assert client.get(ROOT + "/me").json()["profile"]["permanent_address"] == "private address"
    with Session(engine) as db:
        record = db.scalar(select(CitizenAccount))
        assert "_protected_v1" in record.profile and "private address" not in str(record.profile)
    contacts = {"email": "new@example.test", "mobile": "9876543216", "consent": True}
    assert client.patch(ROOT + "/profile", json=contacts).status_code == 403
    assert client.patch(ROOT + "/profile", json={**contacts, "password": PASSWORD}).json()["email"] == contacts["email"]
    assert client.get(ROOT + "/me").json()["profile"]["permanent_address"] == ""
    assert client.post(ROOT + "/photo", json=photo_body()).status_code == 204
    assert client.get(ROOT + "/photo").content == PNG
    with Session(engine) as db:
        assert db.scalar(select(CitizenAccount)).photo != PNG
    assert client.delete(ROOT + "/photo").status_code == 204
    assert client.get(ROOT + "/photo").status_code == 404


def test_wallet_grants_expire_and_files_are_encrypted(client, app, engine):
    assert register(client).status_code == 201
    assert unlock(client).status_code == 200
    item = upload(client).json()
    path = ROOT + "/documents/" + item["id"]
    with Session(engine) as db:
        saved = db.get(CitizenFile, item["id"])
        assert saved.encryption_version == 1
        assert saved.payload != PNG
        assert PNG not in saved.payload
    with TestClient(app) as alternate:
        assert alternate.post(ROOT + "/login", json={"identifier": "citizen@example.test", "password": PASSWORD}).status_code == 200
        assert alternate.get(path).status_code == 423
    assert client.get(path).content == PNG
    assert client.get(path).headers["cache-control"] == "no-store"
    with Session(engine) as db:
        for session in db.scalars(select(AccountSession)):
            session.wallet_until = now_utc() - timedelta(seconds=1)
        db.commit()
    assert client.get(path).status_code == 423
    assert client.post(path + "/delete").status_code == 423
    assert unlock(client).status_code == 200
    assert client.post(ROOT + "/wallet/lock").status_code == 204
    assert client.get(path).status_code == 423
    assert unlock(client).status_code == 200
    assert client.post(ROOT + "/logout").status_code == 204
    assert client.get(path).status_code == 401


def test_consistency_scope_requires_authentication_and_wallet_unlock(client, app):
    assert client.get(ROOT + "/wallet").status_code == 401
    assert register(client).status_code == 201
    assert client.get(ROOT + "/wallet").json()["local_review_scope"] is None
    opened = unlock(client)
    assert opened.status_code == 200
    scope = opened.json()["local_review_scope"]
    assert scope
    assert opened.headers["cache-control"] == "no-store"

    with TestClient(app) as alternate:
        assert register(alternate, "other-review@example.test", "9876543222").status_code == 201
        assert alternate.get(ROOT + "/wallet").json()["local_review_scope"] is None
        assert unlock(alternate).json()["local_review_scope"] != scope

    assert client.post(ROOT + "/wallet/lock").status_code == 204
    assert client.get(ROOT + "/wallet").json()["local_review_scope"] is None
    assert unlock(client).json()["local_review_scope"] == scope
    assert client.post(ROOT + "/logout").status_code == 204
    assert client.get(ROOT + "/wallet").status_code == 401


def test_mpin_change_attempt_limits_and_password_reset(client, engine):
    assert register(client).status_code == 201
    assert unlock(client).status_code == 200
    assert client.post(ROOT + "/wallet/mpin", json={"password": PASSWORD, "pin": "123456"}).status_code == 204
    assert client.get(ROOT + "/documents").status_code == 423
    with Session(engine) as db:
        stored = db.scalar(select(CitizenAccount.mpin_hash))
        assert len(stored) > 100 and stored != "123456"
    assert unlock(client, "123456").status_code == 200
    assert client.post(ROOT + "/wallet/lock").status_code == 204
    for _ in range(4):
        assert unlock(client, "654321").status_code == 403
    assert unlock(client, "654321").status_code == 429
    assert client.post(ROOT + "/login", json={"identifier": "citizen@example.test", "password": PASSWORD}).status_code == 200
    assert unlock(client, "123456").status_code == 429
    assert client.post(ROOT + "/wallet/mpin", json={"password": PASSWORD, "pin": None}).status_code == 204
    assert unlock(client).status_code == 200
    assert client.post(ROOT + "/password", json={"password": PASSWORD, "new_password": "changed-demo-password"}).status_code == 204
    assert client.get(ROOT + "/me").status_code == 401
    assert client.post(ROOT + "/login", json={"identifier": "citizen@example.test", "password": "changed-demo-password"}).status_code == 200
    assert client.get(ROOT + "/documents").status_code == 423


def test_expiry_intervals_preferences_and_export(client):
    assert register(client).status_code == 201
    assert unlock(client).status_code == 200
    for days in (31, 30, 16, 15, 8, 7, 0, -1, None):
        payload = {**photo_body(), "name": "test.png",
                   "expires_on": None if days is None else (today_india() + timedelta(days=days)).isoformat()}
        assert client.post(ROOT + "/documents", json=payload).status_code == 201
    alerts = client.get(ROOT + "/wallet/expiry").json()
    assert [(item["days_left"], item["milestone"]) for item in alerts] == [(0, 7), (7, 7), (8, 15), (15, 15), (16, 30), (30, 30)]
    settings = {"language": "hi", "notifications": True, "expiry_alerts": False}
    assert client.patch(ROOT + "/settings", json=settings).status_code == 200
    assert client.get(ROOT + "/me").json()["settings"] == settings
    assert client.get(ROOT + "/wallet/expiry").json() == []
    assert client.post(ROOT + "/export", json={"password": "wrong"}).status_code == 403
    exported = client.post(ROOT + "/export", json={"password": PASSWORD})
    assert exported.status_code == 200 and len(exported.json()["documents"]) == 9
    assert "password_hash" not in exported.text and b64encode(PNG).decode() not in exported.text
    assert client.post(ROOT + "/wallet/lock").status_code == 204
    assert client.post(ROOT + "/export", json={"password": PASSWORD}).status_code == 423


def test_saved_journey_manual_tracking_and_centres_without_keys(client):
    assert client.get(ROOT + "/centres").status_code == 401
    assert register(client).status_code == 201
    workspace = client.get(ROOT + "/workspace").json()
    workspace["saved"] = ["eshram"]
    workspace["applications"]["eshram"] = {
        "title": "e-Shram", "reference": "TEST-1", "status": "Closed",
        "submission_date": "2025-08-14", "tasks": [True, True, False],
        "applicant_name": "Test Citizen", "applicant_contact": "Test contact",
    }
    response = client.patch(ROOT + "/workspace", json=workspace)
    assert response.status_code == 200
    result = client.get(ROOT + "/workspace").json()
    assert result["saved_at"]["eshram"]
    assert result["applications"]["eshram"]["status"] == "Closed"
    assert result["applications"]["eshram"]["reference"] == "TEST-1"
    assert result["applications"]["eshram"]["updated_at"]
    journey = client.post(ROOT + "/journeys", json={"service_slug": "eshram"})
    assert journey.status_code == 201
    assert client.get(ROOT + "/journeys").json()[0]["service_slug"] == "eshram"
    centres = client.get(ROOT + "/centres").json()
    assert {"glass-house", "kalabhavan", "aiyamgeri", "ballamavati"} <= {row["id"] for row in centres["items"]}
    assert centres["mapped_count"] >= 4
    assert centres["dataset"] == "sourced_snapshot"
    assert all(centre["source"].startswith("https://") for centre in centres["items"])
    assert centres["distance_available"] is False
    assert client.post(ROOT + "/centres/coordinates").json() == []


def test_legacy_encryption_and_directory_categories(client, engine):
    assert register(client).status_code == 201
    assert unlock(client).status_code == 200
    with Session(engine) as db:
        seed_catalogue(db)
        owner = db.scalar(select(CitizenAccount.id))
        old = CitizenFile(account_id=owner, name="legacy.png", category="Other", mime="image/png",
                         size=len(PNG), payload=PNG)
        db.add(old)
        db.commit()
        file_id = old.id
        assert encrypt_legacy_files(db, bytes(range(32))) == 1
        assert encrypt_legacy_files(db, bytes(range(32))) == 0
        assert db.get(CitizenFile, file_id).payload != PNG
    assert client.get(ROOT + "/documents/" + file_id).content == PNG
    for category, count in (("Scholarships", 3), ("Ration Card", 1), ("Land Records", 0), ("Transport Services", 1)):
        assert client.get("/api/services", params={"category": category}).json()["total"] == count


def test_coordinate_lookup_requires_precise_local_match():
    async def run():
        def response(request):
            assert request.url.host == "geocode.googleapis.com"
            return httpx.Response(200, json={"results": [
                {"granularity": "APPROXIMATE", "location": {"latitude": 15, "longitude": 75}},
                {"granularity": "ROOFTOP", "addressComponents": [
                    {"shortText": "IN", "types": ["country"]},
                    {"shortText": "580024", "types": ["postal_code"]},
                ], "location": {"latitude": 15.35, "longitude": 75.14}},
            ]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            return await geocode(client, CENTRES[0])

    assert asyncio.run(run()) == {"id": "glass-house", "latitude": 15.35, "longitude": 75.14}
