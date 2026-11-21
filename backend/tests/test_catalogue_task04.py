from base64 import b64encode
from collections import Counter
from urllib.parse import urlsplit

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.catalogue_seed import load_entries, seed_catalogue
from app.db.citizen_models import CitizenAccount
from app.db.models import EligibilityRule, Service, ServiceDependency, ServiceDocument, ServiceSource
from test_citizen import PNG, ROOT, register, unlock, upload


def migrate_catalogue(engine):
    with Session(engine) as db:
        assert seed_catalogue(db) == 30


def test_catalogue_seed_is_idempotent_and_preserves_data(client, engine):
    assert register(client).status_code == 201
    with Session(engine) as db:
        existing = dict(db.execute(select(Service.slug, Service.id)).all())
        account_id = db.scalar(select(CitizenAccount.id))
        assert len(existing) == 5
        tables = (Service, ServiceDocument, ServiceSource, ServiceDependency, EligibilityRule)
        assert seed_catalogue(db) == 30
        counts = [db.scalar(select(func.count()).select_from(table)) for table in tables]
        assert seed_catalogue(db) == 30
        assert counts == [db.scalar(select(func.count()).select_from(table)) for table in tables]
        current = dict(db.execute(select(Service.slug, Service.id)).all())
        assert len(current) == 32
        assert all(current[slug] == id for slug, id in existing.items())
        assert db.scalar(select(CitizenAccount.id)) == account_id
    assert client.get(ROOT + "/me").status_code == 200


def test_catalogue_search_navigation_and_source_references(client, engine):
    migrate_catalogue(engine)
    entries = load_entries()
    expected = {entry["slug"] for entry in entries}
    assert len(entries) == len(expected) == 30
    pages = [client.get("/api/services", params={"page": page, "page_size": 12}).json() for page in range(1, 4)]
    assert all(page["total"] == 32 for page in pages)
    all_items = [item for page in pages for item in page["items"]]
    assert set(expected) <= {item["slug"] for item in all_items}
    assert all(count == 1 for count in Counter(item["slug"] for item in all_items).values())
    assert Counter(item["browse_category"] for item in all_items if item["slug"] in expected) == {
        "Farmers": 15, "Students": 4, "Women Empowerment": 4, "Pension": 3,
        "Certificates": 2, "Transport": 1, "Other Citizen Services": 1,
    }
    farmers = client.get("/api/services", params={"category": "Farmers", "state": "Karnataka"}).json()
    assert farmers["total"] == 5
    assert all(item["browse_category"] == "Farmers" for item in farmers["items"])
    assert client.get("/api/services", params={"q": "crop insurance"}).json()["items"][0]["slug"] == "pmfby"
    assert client.get("/api/services", params=[("slug", "pm-kisan"), ("slug", "ignoaps")]).json()["total"] == 2
    assert client.get("/api/services", params={"slug": ""}).json()["total"] == 0
    for slug in expected:
        response = client.get("/api/services/" + slug)
        assert response.status_code == 200
        detail = response.json()
        assert detail["catalogue"]["origin"] == "task04_user_list"
        assert detail["catalogue"]["application_status"] is None
        assert detail["catalogue"]["application_deadline"] is None
        assert detail["catalogue"]["overview"] and any(source["checked_at"] for source in detail["sources"])
        for url in (detail["catalogue"]["official_information_url"], detail["catalogue"]["official_application_url"]):
            if url:
                assert urlsplit(url).scheme == "https"
                assert any(source["checked_at"] and source["source_url"] == url for source in detail["sources"])
    dependencies = client.get("/api/services/ssp-post-matric-scholarship/dependencies").json()["items"]
    assert dependencies[0]["prerequisite_service"]["slug"] == "income-certificate"
    assert dependencies[0]["condition"]


def test_eligibility_uses_optional_profile_conditions(client, engine):
    migrate_catalogue(engine)
    assert client.get(ROOT + "/eligibility").status_code == 401
    assert register(client).status_code == 201

    def result():
        return next(row for row in client.get(ROOT + "/eligibility").json() if row["slug"] == "pm-kisan")

    assert result()["unknown"] == 1
    assert result()["match_percentage"] is None
    assert client.patch(ROOT + "/profile", json={"landholding": False, "consent": True}).status_code == 200
    rejected = result()
    assert (rejected["unmatched"], rejected["match_percentage"]) == (1, 0)
    assert client.patch(ROOT + "/profile", json={"landholding": True, "consent": True}).status_code == 200
    matched = result()
    assert (matched["met"], matched["match_percentage"]) == (1, 100)
    assert matched["status"] == "Needs More Information"


def test_document_readiness_is_private_and_handles_expiry(client, engine):
    migrate_catalogue(engine)
    path = ROOT + "/readiness/pm-kisan"
    assert client.get(path).status_code == 401
    assert register(client).status_code == 201
    assert client.get(path).status_code == 423
    assert unlock(client).status_code == 200
    assert upload(client).status_code == 201

    def result():
        data = client.get(path).json()
        return data["items"][0]["status"], data["percentage"]

    assert result() == ("missing", 0)
    file = {"name": "identity.png", "category": "Aadhaar Card", "mime": "image/png",
            "content": b64encode(PNG).decode(), "consent": True, "expires_on": "2000-01-01"}
    added = client.post(ROOT + "/documents", json=file)
    assert added.status_code == 201
    assert result() == ("expired", 0)
    file["expires_on"] = None
    assert client.post(ROOT + "/documents/" + added.json()["id"] + "/replace", json=file).status_code == 200
    assert result() == ("uploaded", 100)
    assert client.get(ROOT + "/readiness/ssp-post-matric-scholarship").json()["percentage"] is None
