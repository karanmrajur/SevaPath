from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import aliased

from app.core.errors import ApiError
from app.core.document_requirements import accepted_document_categories
from app.db.database import Db
from app.db.models import EligibilityRule, Service, ServiceDependency, ServiceDocument, ServiceSource
from app.schemas.catalog import (
    CatalogueRule, Dependency, DocumentRequirement, DocumentRequirements, Jurisdiction, ServiceDependencies,
    ScanCatalogueEntry, ScanDocumentRequirement, ScanRule, ServiceDetail, ServicePage, ServiceSummary, Source,
)

router = APIRouter(prefix="/services", tags=["services"])
OFFICIAL_SOURCES = ("government_portal", "government_publication")


def find_service(db: Db, slug: str) -> Service:
    service = db.scalar(select(Service).where(Service.slug == slug))
    if service is None:
        raise ApiError(404, "service_not_found", "This service could not be found.")
    return service


@router.get("", response_model=ServicePage)
def list_services(
    db: Db,
    q: Annotated[str | None, Query(max_length=120)] = None,
    category: Annotated[str | None, Query(max_length=60)] = None,
    jurisdiction: Jurisdiction | None = None,
    state: Annotated[str | None, Query(max_length=80)] = None,
    slug: Annotated[list[str] | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
):
    filters = []
    for term in (q or "").lower().split():
        filters.append(or_(
            func.lower(Service.name).contains(term, autoescape=True),
            func.lower(Service.description).contains(term, autoescape=True),
            func.lower(Service.category).contains(term, autoescape=True),
            func.lower(Service.browse_category).contains(term, autoescape=True),
            func.lower(Service.subcategory).contains(term, autoescape=True),
            func.lower(Service.state).contains(term, autoescape=True),
        ))
    if category and category.strip():
        value = category.strip().lower()
        compatible = {
            "students": ("students", "education"), "education": ("students", "education"),
            "women empowerment": ("women empowerment",), "welfare": ("welfare", "women empowerment", "pension"),
            "other citizen services": ("other citizen services", "employment"),
        }.get(value, (value,))
        if value == "scholarships":
            filters.append(or_(func.lower(Service.subcategory).contains("scholarship"), Service.slug == "vidyasiri"))
        elif value == "ration card":
            filters.append(Service.slug == "ration-card")
        elif value == "land records":
            filters.append(or_(func.lower(Service.subcategory).contains("land record"),
                               func.lower(Service.category) == "land records"))
        else:
            if value == "transport services":
                compatible = ("transport", "transport services")
            filters.append(or_(func.lower(Service.category).in_(compatible), func.lower(Service.browse_category).in_(compatible)))
    if slug is not None:
        filters.append(Service.slug.in_(slug))
    if jurisdiction:
        filters.append(Service.jurisdiction == jurisdiction)
    if state and state.strip():
        filters.append(func.lower(Service.state) == state.strip().lower())

    items = db.scalars(select(Service).where(*filters)
        .order_by(func.lower(Service.name), Service.slug)
        .offset((page - 1) * page_size).limit(page_size)).all()
    total = db.scalar(select(func.count()).select_from(Service).where(*filters))
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/scan-catalogue", response_model=list[ScanCatalogueEntry])
def scan_catalogue(db: Db):
    services = db.scalars(select(Service).order_by(func.lower(Service.name), Service.slug)).all()
    rules = {service.id: [] for service in services}
    requirements = {service.id: [] for service in services}
    for rule, source in db.execute(verified_rules()):
        rules[rule.service_id].append(ScanRule(
            field=rule.field, explanation=rule.explanation, operator=rule.operator,
            expected_value=rule.expected_value, source=source,
        ))
    by_id = {service.id: service for service in services}
    for document, source in db.execute(verified_documents()):
        service = by_id[document.service_id]
        requirements[service.id].append(ScanDocumentRequirement(
            **document_requirement(document, source).model_dump(),
            accepted_categories=accepted_document_categories(service.slug, document.inventory_category),
        ))
    return [ScanCatalogueEntry(service=service, rules=rules[service.id], requirements=requirements[service.id],
                               partial_rule_coverage=service.catalogue is not None) for service in services]


@router.get("/{slug}", response_model=ServiceDetail)
def service_detail(slug: str, db: Db):
    service = find_service(db, slug)
    sources = db.scalars(select(ServiceSource).where(ServiceSource.service_id == service.id)
        .order_by(ServiceSource.id)).all()
    rules = [CatalogueRule(field=rule.field, explanation=rule.explanation, source=source)
             for rule, source in db.execute(verified_rules().where(EligibilityRule.service_id == service.id))]
    return ServiceDetail(**ServiceSummary.model_validate(service).model_dump(), sources=sources, catalogue=service.catalogue, rules=rules)


def verified_rules():
    return select(EligibilityRule, ServiceSource).join(ServiceSource, EligibilityRule.source_id == ServiceSource.id).where(
        EligibilityRule.verification_status == "verified", ServiceSource.checked_at.is_not(None),
        ServiceSource.source_type.in_(OFFICIAL_SOURCES),
    ).order_by(EligibilityRule.id)


@router.get("/{slug}/documents", response_model=DocumentRequirements)
def documents(slug: str, db: Db):
    service = find_service(db, slug)
    rows = db.execute(verified_documents().where(ServiceDocument.service_id == service.id))
    items = [document_requirement(document, source) for document, source in rows]
    return DocumentRequirements(verification_status="verified" if items else "unverified", items=items)


def verified_documents():
    return select(ServiceDocument, ServiceSource).join(ServiceSource, ServiceDocument.source_id == ServiceSource.id).where(
        ServiceDocument.required_status != "unverified", ServiceSource.checked_at.is_not(None),
        ServiceSource.source_type.in_(OFFICIAL_SOURCES),
    ).order_by(ServiceDocument.document_name, ServiceDocument.id)


def document_requirement(document, source):
    return DocumentRequirement(id=document.id, document_name=document.document_name,
                               required_status=document.required_status, inventory_category=document.inventory_category, source=source)


@router.get("/{slug}/dependencies", response_model=ServiceDependencies)
def dependencies(slug: str, db: Db):
    service = find_service(db, slug)
    prerequisite = aliased(Service)
    rows = db.execute(select(ServiceDependency, prerequisite, ServiceSource)
        .join(prerequisite, ServiceDependency.prerequisite_service_id == prerequisite.id)
        .join(ServiceSource, ServiceDependency.source_id == ServiceSource.id)
        .where(ServiceDependency.service_id == service.id, prerequisite.verification_status == "verified",
               ServiceSource.checked_at.is_not(None), ServiceSource.source_type.in_(OFFICIAL_SOURCES))
        .order_by(prerequisite.name, ServiceDependency.id))
    items = [Dependency(
        id=dependency.id, prerequisite_service=parent, condition=dependency.condition, source=source,
    ) for dependency, parent, source in rows]
    return ServiceDependencies(verification_status="verified" if items else "unverified", items=items)
