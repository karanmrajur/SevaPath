"""Apply the sourced Task 04 catalogue without replacing existing service IDs."""
import json
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .models import EligibilityRule, Service, ServiceDependency, ServiceDocument, ServiceSource

REVIEW_DATE = datetime(2026, 11, 20, tzinfo=UTC)


def load_entries():
    return json.loads(Path(__file__).with_name("catalogue_task04.json").read_text(encoding="utf-8"))


def seed_catalogue(db: Session):
    entries = load_entries()
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgres_insert
    services = {}
    for entry in entries:
        info = entry["details"]
        sources = entry["sources"]
        verified = any(ref["checked"] for ref in sources)
        db.execute(insert(Service).values(
            slug=entry["slug"], name=entry["name"], description=info["overview"] or "Catalogue entry supplied for Task 04. Official details are pending verification.",
            category=entry["category"], jurisdiction="State" if entry["state"] else "Central", state=entry["state"],
            department=entry["department"], official_url=info.get("official_information_url"),
            verification_status="verified" if verified else "unverified",
            last_verified_at=REVIEW_DATE if verified else None,
        ).on_conflict_do_nothing(index_elements=["slug"]))
        service = db.scalar(select(Service).where(Service.slug == entry["slug"]))
        services[entry["slug"]] = service.id
        service.browse_category = entry["category"]
        service.subcategory = entry["subcategory"]
        previous_information_url = (service.catalogue or {}).get("official_information_url")
        if service.official_url is None or service.official_url == previous_information_url:
            service.official_url = info["official_information_url"]
        service.catalogue = info
        if verified:
            service.verification_status = "verified"
            service.last_verified_at = REVIEW_DATE
        refs = []
        for ref in sources:
            db.execute(insert(ServiceSource).values(
                service_id=service.id, source_url=ref["url"], source_title=ref["title"],
                source_type=ref["kind"], checked_at=REVIEW_DATE if ref["checked"] else None,
            ).on_conflict_do_nothing(index_elements=["service_id", "source_url"]))
            source = db.scalar(select(ServiceSource).where(ServiceSource.service_id == service.id, ServiceSource.source_url == ref["url"]))
            if ref["checked"] and source.checked_at is None:
                source.source_type = ref["kind"]
                source.checked_at = REVIEW_DATE
            refs.append(source)
        for document in entry.get("documents", []):
            source = refs[document["source"]]
            db.execute(insert(ServiceDocument).values(
                service_id=service.id, document_name=document["name"], required_status=document["status"],
                inventory_category=document.get("category"), source_id=source.id,
            ).on_conflict_do_nothing(index_elements=["service_id", "document_name"]))
        for rule in entry.get("rules", []):
            source = refs[rule["source"]]
            existing = db.scalar(select(EligibilityRule.id).where(
                EligibilityRule.service_id == service.id, EligibilityRule.source_id == source.id,
                EligibilityRule.explanation == rule["explanation"],
            ))
            if existing is None:
                db.add(EligibilityRule(
                    service_id=service.id, source_id=source.id, field=rule["field"], operator=rule["operator"],
                    expected_value=rule["expected_value"], explanation=rule["explanation"], verification_status="verified",
                ))
    for entry in entries:
        service_id = services[entry["slug"]]
        for dependency in entry.get("dependencies", []):
            ref = entry["sources"][dependency["source"]]
            source_id = db.scalar(select(ServiceSource.id).where(
                ServiceSource.service_id == service_id, ServiceSource.source_url == ref["url"],
            ))
            db.execute(insert(ServiceDependency).values(
                service_id=service_id, prerequisite_service_id=services[dependency["slug"]],
                condition=dependency["condition"], source_id=source_id,
            ).on_conflict_do_nothing(index_elements=["service_id", "prerequisite_service_id"]))
    db.commit()
    return len(entries)
