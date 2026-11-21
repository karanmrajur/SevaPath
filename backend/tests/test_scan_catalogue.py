from sqlalchemy.orm import Session

from app.db.catalogue_seed import seed_catalogue
from app.db.models import EligibilityRule, Service
from sqlalchemy import select


def test_scan_catalogue_sends_public_rules_and_document_matches_only(client, engine):
    with Session(engine) as db:
        seed_catalogue(db)
        service = db.scalar(select(Service).where(Service.slug == "pm-kisan"))
        db.add(EligibilityRule(service_id=service.id, field="age", operator="gte",
                              expected_value=99, explanation="Unverified fixture rule",
                              source_id=None, verification_status="unverified"))
        db.commit()

    path = "/api/services/scan-catalogue"
    response = client.get(path)
    assert response.status_code == 200
    entries = {entry["service"]["slug"]: entry for entry in response.json()}
    assert len(entries) == 32
    pm_kisan = entries["pm-kisan"]
    assert pm_kisan["partial_rule_coverage"] is True
    [rule] = pm_kisan["rules"]
    assert rule["field"] == "landholding"
    assert rule["operator"] == "eq"
    assert rule["expected_value"] is True
    assert rule["source"]["checked_at"]
    assert pm_kisan["requirements"][0]["accepted_categories"] == ["Aadhaar Card"]
    assert client.post(path, json={"example": "synthetic"}).status_code == 405
