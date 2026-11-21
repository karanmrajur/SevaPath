from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.sessions import COOKIE, token_digest
from app.db.models import AnonymousSession, EligibilityRule, Service, ServiceDependency, ServiceDocument, ServiceSource, now_utc
from app.db.seed import seed

from conftest import FRONTEND

DRAFT = {"title": "Sample complaint", "department": "Example office", "description": "An example for the demo."}


def start_session(client):
    response = client.post("/api/session")
    assert response.status_code == 204
    return response


def create_journey(client):
    response = client.post("/api/journeys", json={"service_slug": "eshram"})
    assert response.status_code == 201
    return response.json()


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "reachable"}
    assert client.get("/docs").status_code == 200


def test_listing_and_stable_pagination(client):
    response = client.get("/api/services")
    assert response.status_code == 200
    catalog = response.json()
    assert catalog["total"] == 5
    assert [item["slug"] for item in catalog["items"]] == [
        "eshram", "caste-certificate", "gruha-lakshmi", "income-certificate", "scholarships",
    ]
    paged = client.get("/api/services", params={"page": 2, "page_size": 2}).json()
    assert paged == {"total": 5, "page": 2, "page_size": 2, "items": catalog["items"][2:4]}


def test_search_and_filters(client):
    response = client.get("/api/services", params={
        "q": "KARNATAKA certification", "category": "certificates", "jurisdiction": "State", "state": "karnataka",
    })
    assert response.status_code == 200
    assert [item["slug"] for item in response.json()["items"]] == ["caste-certificate", "income-certificate"]
    assert client.get("/api/services", params={"q": "%"}).json()["total"] == 0
    assert client.get("/api/services", params={"q": "unorganised", "jurisdiction": "Central"}).json()["total"] == 1
    assert client.get("/api/services", params={"jurisdiction": "Central", "state": "Karnataka"}).json()["total"] == 0


def test_service_detail_and_unverified_related_data(client):
    response = client.get("/api/services/income-certificate")
    assert response.status_code == 200
    detail = response.json()
    assert detail["state"] == "Karnataka"
    assert detail["department"] == "Karnataka Revenue Department"
    assert detail["verification_status"] == "verified"
    assert detail["last_verified_at"].endswith("Z")
    assert detail["official_url"] == "https://sevasindhu.karnataka.gov.in/Sevasindhu/English"
    assert len(detail["sources"]) == 2
    for suffix in ("documents", "dependencies"):
        result = client.get(f"/api/services/income-certificate/{suffix}")
        assert result.status_code == 200
        assert result.json() == {"verification_status": "unverified", "items": []}


@pytest.mark.parametrize("suffix", ["", "/documents", "/dependencies"])
def test_unknown_service_returns_404(client, suffix):
    response = client.get(f"/api/services/unknown{suffix}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "service_not_found"


def test_seeding_is_idempotent(engine):
    with Session(engine) as db:
        ids = db.scalars(select(Service.id).order_by(Service.id)).all()
        seed(db)
        seed(db)
        assert db.scalars(select(Service.id).order_by(Service.id)).all() == ids
        assert len(ids) == 5
        assert db.scalar(select(func.count()).select_from(ServiceSource)) == 10
        for table in (EligibilityRule, ServiceDocument, ServiceDependency):
            assert db.scalar(select(func.count()).select_from(table)) == 0


def test_related_data_requires_checked_official_sources(client, engine):
    with Session(engine) as db:
        service = db.scalar(select(Service).where(Service.slug == "eshram"))
        prerequisite = db.scalar(select(Service).where(Service.slug == "scholarships"))
        checked = db.scalar(select(ServiceSource).where(ServiceSource.service_id == service.id))
        unchecked = ServiceSource(
            service_id=service.id, source_url="https://example.test/", source_title="Test", source_type="government_portal",
        )
        db.add(unchecked)
        db.flush()
        db.add_all([
            ServiceDocument(service_id=service.id, document_name="Fixture A", required_status="required", source_id=checked.id),
            ServiceDocument(service_id=service.id, document_name="Fixture B", required_status="required", source_id=unchecked.id),
            ServiceDocument(service_id=service.id, document_name="Fixture C", required_status="unverified", source_id=checked.id),
            ServiceDependency(service_id=service.id, prerequisite_service_id=prerequisite.id, source_id=checked.id),
        ])
        db.commit()

    documents = client.get("/api/services/eshram/documents").json()
    assert documents["verification_status"] == "verified"
    assert [item["document_name"] for item in documents["items"]] == ["Fixture A"]
    dependencies = client.get("/api/services/eshram/dependencies").json()
    assert dependencies["verification_status"] == "verified"
    assert dependencies["items"][0]["prerequisite_service"]["slug"] == "scholarships"


def test_journey_create_resume_and_update(client):
    start_session(client)
    journey = create_journey(client)
    assert [task["status"] for task in journey["tasks"]] == ["complete", "pending", "pending"]
    assert client.get("/api/journeys").json() == [journey]
    assert client.get(f"/api/journeys/{journey['id']}").json() == journey
    resumed = client.post("/api/journeys", json={"service_slug": "eshram"})
    assert resumed.status_code == 200
    assert resumed.json() == journey

    paths = [f"/api/journeys/{journey['id']}/tasks/{task['id']}" for task in journey["tasks"][1:]]
    for path in paths:
        response = client.patch(path, json={"completed": True})
        assert response.status_code == 200
    completed = response.json()
    assert completed["status"] == "complete"
    assert all(task["completed_at"] for task in completed["tasks"])
    assert client.patch(paths[-1], json={"completed": True}).json() == completed
    reopened = client.patch(paths[-1], json={"completed": False}).json()
    assert reopened["status"] == "in_progress"
    assert reopened["tasks"][-1]["completed_at"] is None


def test_grievance_create_retry_and_edit(client):
    start_session(client)
    payload = {**DRAFT, "request_id": str(uuid4())}
    response = client.post("/api/grievances", json=payload)
    assert response.status_code == 201
    draft = response.json()
    assert draft["local_status"] == "draft"
    assert draft["official_reference_number"] is None
    assert "Department: Example office" in draft["draft_text"]
    retry = client.post("/api/grievances", json=payload)
    assert retry.status_code == 200
    assert retry.json()["id"] == draft["id"]
    edited = client.patch(f"/api/grievances/{draft['id']}", json={"department": None, "local_status": "ready", "description": "Updated."})
    assert edited.status_code == 200
    assert edited.json()["local_status"] == "ready"
    assert edited.json()["draft_text"] == "Subject: Sample complaint\n\nUpdated."
    assert client.get("/api/grievances").json() == [edited.json()]


def test_anonymous_workspace_ownership(client, app, engine):
    assert client.get("/api/journeys").status_code == 401
    assert client.get("/api/grievances").status_code == 401
    cookie = start_session(client).headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/api" in cookie
    assert "set-cookie" not in start_session(client).headers
    journey = create_journey(client)
    path = f"/api/journeys/{journey['id']}"
    task = f"{path}/tasks/{journey['tasks'][1]['id']}"
    draft = client.post("/api/grievances", json=DRAFT).json()

    with Session(engine) as db:
        owner = db.scalar(select(AnonymousSession))
        assert owner.token_hash == token_digest(client.cookies.get(COOKIE))
        owner_id = owner.id

    with TestClient(app) as stranger:
        assert stranger.get(path).status_code == 401
        assert stranger.get(path, headers={"Cookie": f"{COOKIE}={owner_id}"}).status_code == 401
        start_session(stranger)
        assert stranger.get(path).status_code == 404
        assert stranger.patch(task, json={"completed": True}).status_code == 404
        own_journey = create_journey(stranger)
        foreign_task = f"/api/journeys/{own_journey['id']}/tasks/{journey['tasks'][1]['id']}"
        assert stranger.patch(foreign_task, json={"completed": True}).status_code == 404
        assert stranger.get("/api/grievances", params={"anonymous_session_id": owner_id}).json() == []
        assert stranger.patch(f"/api/grievances/{draft['id']}", json={"title": "Other"}).status_code == 404

    with Session(engine) as db:
        db.get(AnonymousSession, owner_id).expires_at = now_utc() - timedelta(seconds=5)
        db.commit()
    assert client.get(path).status_code == 401
    start_session(client)
    assert client.get(path).status_code == 404
    assert client.get("/api/grievances").headers["cache-control"] == "no-store"


def test_cors_and_origin_protection(client):
    headers = {"Origin": FRONTEND, "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type"}
    valid = client.options("/api/grievances", headers=headers)
    assert valid.status_code == 200
    assert valid.headers["access-control-allow-origin"] == FRONTEND
    assert valid.headers["access-control-allow-credentials"] == "true"
    assert client.options("/api/grievances", headers={**headers, "Origin": "http://unapproved.test"}).status_code == 400
    start_session(client)
    blocked = client.post("/api/grievances", json=DRAFT, headers={"Origin": "http://unapproved.test"})
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "origin_forbidden"
    assert client.get("/api/grievances").json() == []


def test_input_validation(client):
    start_session(client)
    journey = create_journey(client)
    task = f"/api/journeys/{journey['id']}/tasks/{journey['tasks'][0]['id']}"
    draft = client.post("/api/grievances", json=DRAFT).json()
    responses = [
        client.get("/api/services", params={"page_size": 0}),
        client.get("/api/services", params={"jurisdiction": "Other"}),
        client.get("/api/journeys/bad-id"),
        client.post("/api/journeys", json={"service_slug": "Invalid slug"}),
        client.patch(task, json={"completed": "yes"}),
        client.post("/api/grievances", json={"title": "  ", "description": "x"}),
        client.post("/api/grievances", json={**DRAFT, "description": "x" * 2001}),
        client.post("/api/grievances", json={**DRAFT, "official_reference_number": "fake"}),
        client.patch(f"/api/grievances/{draft['id']}", json={"title": None}),
        client.patch(f"/api/grievances/{draft['id']}", json={}),
    ]
    for response in responses:
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"
        assert response.json()["error"]["details"]
