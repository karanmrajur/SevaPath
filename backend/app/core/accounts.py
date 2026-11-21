import hashlib
import hmac
import re
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy import select

from app.db.citizen_models import AccountSession, CitizenAccount
from app.db.database import Db
from app.db.models import now_utc

from .errors import ApiError

COOKIE = "sevapath_account"
TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")
DUMMY_SALT = bytes(16)


def digest(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def derive(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2**15, r=8, p=3, maxmem=64 * 1024**2)


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"{salt.hex()}:{derive(password, salt).hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    salt, expected = (bytes.fromhex(value) for value in stored.split(":")) if stored else (DUMMY_SALT, bytes(64))
    return hmac.compare_digest(derive(password, salt), expected) and stored is not None


def session_key(request: Request) -> str | None:
    token = request.cookies.get(COOKIE, "")
    return digest(token) if TOKEN.fullmatch(token) else None


def current_account(request: Request, db: Db) -> CitizenAccount | None:
    key = session_key(request)
    if key is None:
        return None
    return db.scalar(select(CitizenAccount).join(AccountSession).where(
        AccountSession.token_hash == key,
        AccountSession.expires_at > now_utc(),
    ))


def require_account(request: Request, db: Db) -> CitizenAccount:
    account = current_account(request, db)
    if account is None:
        raise ApiError(401, "account_required", "Sign in to access your citizen workspace.")
    return account


Account = Annotated[CitizenAccount, Depends(require_account)]


def revoke_session(request: Request, db: Db):
    key = session_key(request)
    if key is not None:
        session = db.get(AccountSession, key)
        if session is not None:
            db.delete(session)


def issue_session(request: Request, response: Response, db: Db, account: CitizenAccount, remember: bool):
    revoke_session(request, db)
    token = secrets.token_urlsafe(32)
    lifetime = timedelta(days=14) if remember else timedelta(hours=8)
    db.add(AccountSession(token_hash=digest(token), account_id=account.id, expires_at=now_utc() + lifetime))
    db.commit()
    response.set_cookie(
        COOKIE, token, max_age=int(lifetime.total_seconds()) if remember else None,
        httponly=True, secure=request.app.state.settings.session_cookie_secure, samesite="lax", path="/api",
    )


def clear_cookie(request: Request, response: Response):
    response.delete_cookie(
        COOKIE, path="/api", secure=request.app.state.settings.session_cookie_secure, httponly=True, samesite="lax",
    )
