from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def now_utc() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid4())


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class Service(Timestamps, Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("jurisdiction IN ('Central', 'State')", name="jurisdiction"),
        CheckConstraint("(jurisdiction = 'Central' AND state IS NULL) OR (jurisdiction = 'State' AND state IS NOT NULL)", name="state_jurisdiction"),
        CheckConstraint("verification_status IN ('verified', 'unverified')", name="verification"),
        Index("ix_services_jurisdiction_state", "jurisdiction", "state"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(60), index=True)
    browse_category: Mapped[str | None] = mapped_column(String(60), index=True)
    subcategory: Mapped[str | None] = mapped_column(String(80))
    catalogue: Mapped[dict | None] = mapped_column(JSON)
    jurisdiction: Mapped[str] = mapped_column(String(16))
    state: Mapped[str | None] = mapped_column(String(80))
    department: Mapped[str | None] = mapped_column(String(160))
    official_url: Mapped[str | None] = mapped_column(String(600))
    verification_status: Mapped[str] = mapped_column(String(16), default="unverified")
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ServiceSource(Base):
    __tablename__ = "service_sources"
    __table_args__ = (
        UniqueConstraint("service_id", "source_url"),
        UniqueConstraint("service_id", "id", name="uq_service_sources_service_id_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"))
    source_url: Mapped[str] = mapped_column(String(600))
    source_title: Mapped[str] = mapped_column(String(200))
    source_type: Mapped[str] = mapped_column(String(40))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EligibilityRule(Base):
    __tablename__ = "eligibility_rules"
    __table_args__ = (
        CheckConstraint("verification_status IN ('verified', 'unverified')", name="verification"),
        ForeignKeyConstraint(("service_id", "source_id"), ("service_sources.service_id", "service_sources.id")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"), index=True)
    field: Mapped[str] = mapped_column(String(100))
    operator: Mapped[str] = mapped_column(String(40))
    expected_value: Mapped[object] = mapped_column(JSON)
    explanation: Mapped[str] = mapped_column(Text)
    source_id: Mapped[int | None]
    verification_status: Mapped[str] = mapped_column(String(16), default="unverified")


class ServiceDocument(Base):
    __tablename__ = "service_documents"
    __table_args__ = (
        UniqueConstraint("service_id", "document_name"),
        CheckConstraint("required_status IN ('required', 'optional', 'conditional', 'unverified')", name="required_status"),
        ForeignKeyConstraint(("service_id", "source_id"), ("service_sources.service_id", "service_sources.id")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"))
    document_name: Mapped[str] = mapped_column(String(160))
    required_status: Mapped[str] = mapped_column(String(16), default="unverified")
    inventory_category: Mapped[str | None] = mapped_column(String(50))
    source_id: Mapped[int | None]


class ServiceDependency(Base):
    __tablename__ = "service_dependencies"
    __table_args__ = (
        UniqueConstraint("service_id", "prerequisite_service_id"),
        CheckConstraint("service_id <> prerequisite_service_id", name="distinct_services"),
        ForeignKeyConstraint(("service_id", "source_id"), ("service_sources.service_id", "service_sources.id")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"))
    prerequisite_service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"), index=True)
    condition: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[int | None]


class AnonymousSession(Base):
    __tablename__ = "anonymous_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class CitizenJourney(Timestamps, Base):
    __tablename__ = "citizen_journeys"
    __table_args__ = (
        UniqueConstraint("anonymous_session_id", "service_id"),
        CheckConstraint("status IN ('in_progress', 'complete')", name="status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    anonymous_session_id: Mapped[str] = mapped_column(ForeignKey("anonymous_sessions.id", ondelete="CASCADE"))
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="in_progress")


class JourneyTask(Base):
    __tablename__ = "journey_tasks"
    __table_args__ = (
        UniqueConstraint("journey_id", "sort_order"),
        CheckConstraint("sort_order > 0", name="sort_order"),
        CheckConstraint("(status = 'pending' AND completed_at IS NULL) OR (status = 'complete' AND completed_at IS NOT NULL)", name="completion"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    journey_id: Mapped[str] = mapped_column(ForeignKey("citizen_journeys.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    sort_order: Mapped[int]
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Grievance(Timestamps, Base):
    __tablename__ = "grievances"
    __table_args__ = (
        Index("ix_grievances_session_updated_at", "anonymous_session_id", "updated_at"),
        UniqueConstraint("anonymous_session_id", "request_id"),
        CheckConstraint("local_status IN ('draft', 'ready', 'archived')", name="local_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    anonymous_session_id: Mapped[str] = mapped_column(ForeignKey("anonymous_sessions.id", ondelete="CASCADE"))
    request_id: Mapped[str | None] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(120))
    department: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    draft_text: Mapped[str] = mapped_column(Text)
    local_status: Mapped[str] = mapped_column(String(16), default="draft")
    official_reference_number: Mapped[str | None] = mapped_column(String(120))
