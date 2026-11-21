from base64 import b64decode, b64encode

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.citizen_models import CitizenAccount, CitizenFile
from app.db.models import CitizenJourney, EligibilityRule, Grievance, Service, ServiceSource

ROOT = "/api/citizen"
PASSWORD = "local-test-password"
PNG = b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlGAAAAAASUVORK5CYII=")


def register(client, email="citizen@example.test", mobile="9876543210"):
    return client.post(ROOT + "/register", json={
        "name": "Test Citizen", "email": email, "mobile": mobile, "password": PASSWORD,
    })


def unlock(client, credential=PASSWORD):
    return client.post(ROOT + "/wallet/unlock", json={"credential": credential})


def upload(client, data=PNG, replacing=None):
    path = ROOT + "/documents" + (f"/{replacing}/replace" if replacing else "")
    return client.post(path, json={
        "name": "sample.png", "category": "Other", "mime": "image/png",
        "content": b64encode(data).decode(), "consent": True,
    })


def test_account_session_is_required_and_revoked(client, engine):
    assert client.get(ROOT + "/me").status_code == 401
    assert client.post("/api/session").status_code == 204
    assert client.get(ROOT + "/journeys").status_code == 401
    created = register(client, "Citizen@example.test")
    assert created.status_code == 201
    assert created.json()["email"] == "citizen@example.test"
    assert "password" not in created.text and created.json()["mobile"] == "9876543210"
    assert "HttpOnly" in created.headers["set-cookie"]
    assert "SameSite=lax" in created.headers["set-cookie"]
    assert "Max-Age" not in created.headers["set-cookie"]
    assert created.headers["cache-control"] == "no-store"
    token = client.cookies.get("sevapath_account")
    with Session(engine) as db:
        account = db.scalar(select(CitizenAccount))
        assert account.password_hash != PASSWORD and PASSWORD not in account.password_hash
    assert client.get(ROOT + "/me").status_code == 200
    assert client.post(ROOT + "/logout", headers={"Origin": "https://other.example"}).status_code == 403
    assert client.post(ROOT + "/logout").status_code == 204
    assert client.get(ROOT + "/me", headers={"Cookie": f"sevapath_account={token}"}).status_code == 401
    assert client.get("/api/journeys").status_code == 200
    assert client.post(ROOT + "/login", json={"identifier": "9876543210", "password": "wrong"}).status_code == 401
    relogin = client.post(ROOT + "/login", json={"identifier": "+91 98765 43210", "password": PASSWORD, "remember": True})
    assert relogin.status_code == 200 and "Max-Age=1209600" in relogin.headers["set-cookie"]
    assert register(client).status_code == 409


def test_documents_and_workspace_are_isolated(client, app):
    assert register(client).status_code == 201
    assert client.get(ROOT + "/documents").status_code == 423
    assert unlock(client).status_code == 200
    assert upload(client, b"invalid file").status_code == 422
    created = upload(client)
    assert created.status_code == 201
    file_id = created.json()["id"]
    assert set(created.json()) == {"id", "name", "category", "mime", "size", "expires_on", "uploaded_at"}
    path = ROOT + "/documents/" + file_id
    assert client.get(path).content == PNG
    assert client.get(path).headers["x-content-type-options"] == "nosniff"
    assert upload(client, replacing=file_id).status_code == 200
    ws = client.get(ROOT + "/workspace").json()
    ws["saved"] = ["eshram"]
    assert client.patch(ROOT + "/workspace", json=ws).json()["version"] == 1
    assert client.patch(ROOT + "/workspace", json=ws).status_code == 409
    with TestClient(app) as other:
        assert other.get(path).status_code == 401
        assert register(other, "another@example.test", "9876543211").status_code == 201
        assert other.get(path).status_code == 423
        assert unlock(other).status_code == 200
        assert other.get(path).status_code == 404
        assert other.post(path + "/delete").status_code == 404
        assert other.get(ROOT + "/documents").json() == []
        assert other.get(ROOT + "/workspace").json()["saved"] == []
    assert client.post(path + "/delete").status_code == 204
    assert client.get(path).status_code == 404


def test_sourced_eligibility_and_consent(client, engine):
    assert register(client).status_code == 201
    assert all(row["status"] == "Needs More Information" for row in client.get(ROOT + "/eligibility").json())
    assert client.patch(ROOT + "/profile", json={"age": 20}).status_code == 422
    with Session(engine) as db:
        service = db.scalar(select(Service).where(Service.slug == "eshram"))
        source = db.scalar(select(ServiceSource).where(ServiceSource.service_id == service.id))
        db.add(EligibilityRule(
            service_id=service.id, source_id=source.id, field="age", operator="gte",
            expected_value=18, explanation="Synthetic test rule", verification_status="verified",
        ))
        db.commit()
    def result():
        return next(item for item in client.get(ROOT + "/eligibility").json() if item["slug"] == "eshram")
    assert result()["status"] == "Needs More Information"
    assert client.patch(ROOT + "/profile", json={"age": 20, "consent": True}).status_code == 200
    assert result()["status"] == "Likely Eligible"
    assert result()["checks"][0]["met"] is True
    assert client.patch(ROOT + "/profile", json={"age": 16, "consent": True}).status_code == 200
    assert result()["status"] == "Not Eligible"


def test_account_deletion_cascades_private_records(client, engine):
    assert register(client).status_code == 201
    assert unlock(client).status_code == 200
    assert upload(client).status_code == 201
    assert client.post(ROOT + "/journeys", json={"service_slug": "eshram"}).status_code == 201
    assert client.post(ROOT + "/grievances", json={"title": "Test draft", "description": "A synthetic test draft."}).status_code == 201
    assert client.post(ROOT + "/delete-account", json={"password": "incorrect"}).status_code == 403
    response = client.post(ROOT + "/delete-account", json={"password": PASSWORD})
    assert response.status_code == 204
    assert client.get(ROOT + "/me").status_code == 401
    with Session(engine) as db:
        for model in (CitizenAccount, CitizenFile, CitizenJourney, Grievance):
            assert db.scalar(select(func.count()).select_from(model)) == 0
