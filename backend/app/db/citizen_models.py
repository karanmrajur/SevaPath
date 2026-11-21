from datetime import date, datetime

from sqlalchemy import JSON, text, Date, DateTime, ForeignKey, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import Timestamps, new_id


class CitizenAccount(Timestamps, Base):
    __tablename__ = "citizen_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("anonymous_sessions.id"), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    mobile: Mapped[str] = mapped_column(String(10), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    profile: Mapped[dict] = mapped_column(JSON, default=dict)
    workspace: Mapped[dict] = mapped_column(JSON, default=dict)
    workspace_version: Mapped[int] = mapped_column(default=0)
    settings: Mapped[dict | None] = mapped_column(JSON)
    photo: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    photo_mime: Mapped[str | None] = mapped_column(String(30))
    mpin_hash: Mapped[str | None] = mapped_column(String(200))
    wallet_attempts: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    wallet_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AccountSession(Base):
    __tablename__ = "account_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("citizen_accounts.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    wallet_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CitizenFile(Timestamps, Base):
    __tablename__ = "citizen_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    account_id: Mapped[str] = mapped_column(ForeignKey("citizen_accounts.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(140))
    category: Mapped[str] = mapped_column(String(50))
    mime: Mapped[str] = mapped_column(String(30))
    size: Mapped[int]
    expires_on: Mapped[date | None] = mapped_column(Date)
    encryption_version: Mapped[int | None]
    payload: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
