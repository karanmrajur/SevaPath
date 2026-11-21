from datetime import timedelta
from hashlib import sha256
import re
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select

from app.db.database import Db
from app.db.models import AnonymousSession, now_utc

from .accounts import require_account
from .errors import ApiError

COOKIE = "sevapath_session"
TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{43}")
router = APIRouter(tags=["anonymous session"])


def token_digest(token: str) -> str:
    return sha256(token.encode("ascii")).hexdigest()


def find_session(request: Request, db: Db) -> AnonymousSession | None:
    token = request.cookies.get(COOKIE, "")
    if not TOKEN_PATTERN.fullmatch(token):
        return None
    return db.scalar(select(AnonymousSession).where(
        AnonymousSession.token_hash == token_digest(token),
        AnonymousSession.expires_at > now_utc(),
    ))


def require_session(request: Request, db: Db) -> str:
    if request.url.path.startswith("/api/citizen/"):
        return require_account(request, db).workspace_id
    session = find_session(request, db)
    if session is None:
        raise ApiError(401, "session_required", "Start an anonymous browser session to access this workspace.")
    return session.id


Owner = Annotated[str, Depends(require_session)]


@router.post("/session", status_code=204)
def start_session(request: Request, response: Response, db: Db) -> None:
    if find_session(request, db) is not None:
        return

    settings = request.app.state.settings
    token = secrets.token_urlsafe(32)
    lifetime = timedelta(days=settings.session_ttl_days)
    db.add(AnonymousSession(token_hash=token_digest(token), expires_at=now_utc() + lifetime))
    db.commit()
    response.set_cookie(
        COOKIE, token, max_age=int(lifetime.total_seconds()),
        httponly=True, secure=settings.session_cookie_secure, samesite="lax", path="/api",
    )
