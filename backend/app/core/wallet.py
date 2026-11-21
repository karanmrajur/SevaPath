from datetime import datetime, timedelta, timezone
import secrets
from typing import Annotated

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Depends, Request
from sqlalchemy import select, update

from app.db.citizen_models import AccountSession, CitizenAccount
from app.db.database import Db
from app.db.models import now_utc

from .accounts import Account, session_key, verify_password
from .errors import ApiError

WALLET_DURATION = timedelta(minutes=5)
RETRY_DURATION = timedelta(minutes=15)
MAX_ATTEMPTS = 5


def aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def active_session(request: Request, account: Account, db: Db) -> AccountSession:
    key = session_key(request)
    session = db.scalar(select(AccountSession).where(
        AccountSession.token_hash == key, AccountSession.account_id == account.id,
        AccountSession.expires_at > now_utc(),
    ))
    if session is None:
        raise ApiError(401, "account_required", "Sign in to access your citizen workspace.")
    return session


def wallet_unlocked(session: AccountSession) -> bool:
    return session.wallet_until is not None and aware(session.wallet_until) > now_utc()


def require_wallet(request: Request, account: Account, db: Db) -> CitizenAccount:
    if not wallet_unlocked(active_session(request, account, db)):
        raise ApiError(423, "wallet_locked", "Unlock your document wallet to continue.")
    return account


WalletAccount = Annotated[CitizenAccount, Depends(require_wallet)]


def serialize_account(account: CitizenAccount, db: Db):
    db.execute(update(CitizenAccount).where(CitizenAccount.id == account.id)
               .values(wallet_attempts=CitizenAccount.wallet_attempts))
    db.refresh(account)


def check_wallet_secret(account: CitizenAccount, db: Db, credential: str):
    serialize_account(account, db)
    now = now_utc()
    if account.wallet_retry_at is not None:
        if aware(account.wallet_retry_at) > now:
            raise ApiError(429, "wallet_retry_later", "Too many unlock attempts. Try again in 15 minutes.")
        account.wallet_attempts = 0
        account.wallet_retry_at = None
    if not verify_password(credential, account.mpin_hash or account.password_hash):
        account.wallet_attempts += 1
        if account.wallet_attempts >= MAX_ATTEMPTS:
            account.wallet_retry_at = now + RETRY_DURATION
            db.execute(update(AccountSession).where(AccountSession.account_id == account.id).values(wallet_until=None))
        db.commit()
        if account.wallet_attempts >= MAX_ATTEMPTS:
            raise ApiError(429, "wallet_retry_later", "Too many unlock attempts. Try again in 15 minutes.")
        raise ApiError(403, "wallet_credential_invalid", "The wallet credential did not match.")
    account.wallet_attempts = 0


def cipher(key: bytes | None) -> AESGCM:
    if key is None:
        raise ApiError(503, "wallet_storage_unavailable", "Encrypted storage needs server configuration.")
    return AESGCM(key)


def seal(key: bytes | None, payload: bytes, context: str) -> bytes:
    nonce = secrets.token_bytes(12)
    return nonce + cipher(key).encrypt(nonce, payload, context.encode("ascii"))


def unseal(key: bytes | None, payload: bytes, context: str) -> bytes:
    try:
        return cipher(key).decrypt(payload[:12], payload[12:], context.encode("ascii"))
    except (InvalidTag, ValueError):
        raise ApiError(503, "wallet_file_unavailable", "This encrypted file is temporarily unavailable.") from None


def document_context(account_id: str, file_id: str) -> str:
    return f"sevapath:document:v1:{account_id}:{file_id}"


def photo_context(account_id: str) -> str:
    return f"sevapath:photo:v1:{account_id}"


def profile_context(account_id: str) -> str:
    return f"sevapath:profile:v1:{account_id}"
