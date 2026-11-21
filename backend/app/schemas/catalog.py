from datetime import UTC, date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, JsonValue


def with_timezone(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


Timestamp = Annotated[datetime, AfterValidator(with_timezone)]
VerificationStatus = Literal["verified", "unverified"]
Jurisdiction = Literal["Central", "State"]


class Record(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ServiceSummary(Record):
    id: int
    slug: str
    name: str
    description: str
    category: str
    browse_category: str | None = None
    subcategory: str | None = None
    jurisdiction: Jurisdiction
    state: str | None
    department: str | None
    official_url: str | None
    verification_status: VerificationStatus
    last_verified_at: Timestamp | None
    created_at: Timestamp
    updated_at: Timestamp


class ServicePage(BaseModel):
    items: list[ServiceSummary]
    total: int
    page: int
    page_size: int


class Source(Record):
    id: int
    source_url: str
    source_title: str
    source_type: str
    checked_at: Timestamp | None


class CatalogueDetails(BaseModel):
    origin: str
    overview: str | None = None
    benefits: list[str] = []
    eligibility_guidance: list[str] = []
    procedure: list[str] = []
    official_information_url: str | None = None
    official_application_url: str | None = None
    application_opens: date | None = None
    application_deadline: date | None = None
    application_status: str | None = None
    previous_application_period: str | None = None
    previous_eligibility: str | None = None


class CatalogueRule(BaseModel):
    field: str
    explanation: str
    source: Source


class ServiceDetail(ServiceSummary):
    sources: list[Source]
    catalogue: CatalogueDetails | None = None
    rules: list[CatalogueRule] = []


class DocumentRequirement(BaseModel):
    id: int
    document_name: str
    required_status: Literal["required", "optional", "conditional"]
    inventory_category: str | None = None
    source: Source


class ScanRule(CatalogueRule):
    operator: str
    expected_value: JsonValue


class ScanDocumentRequirement(DocumentRequirement):
    accepted_categories: tuple[str, ...]


class ScanCatalogueEntry(BaseModel):
    service: ServiceSummary
    rules: list[ScanRule]
    requirements: list[ScanDocumentRequirement]
    partial_rule_coverage: bool


class Dependency(BaseModel):
    id: int
    prerequisite_service: ServiceSummary
    condition: str | None
    source: Source


class DocumentRequirements(BaseModel):
    verification_status: VerificationStatus
    items: list[DocumentRequirement]


class ServiceDependencies(BaseModel):
    verification_status: VerificationStatus
    items: list[Dependency]
