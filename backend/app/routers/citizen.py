from base64 import b64decode, b64encode
import json
from binascii import Error as BinaryError
from collections import deque
from datetime import timedelta
import re
import secrets
from threading import Lock
from time import monotonic
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Request, Response
from pydantic import ValidationError
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError

from app.core.accounts import Account, clear_cookie, issue_session, password_hash, revoke_session, session_key, verify_password
from app.core.wallet import (
    WalletAccount, active_session, aware, check_wallet_secret, document_context,
    photo_context, profile_context, seal, serialize_account, unseal, wallet_unlocked, WALLET_DURATION,
)
from app.core.errors import ApiError
from app.core.document_requirements import accepted_document_categories
from app.db.citizen_models import AccountSession, CitizenAccount, CitizenFile
from app.db.database import Db
from app.db.models import AnonymousSession, EligibilityRule, Service, new_id, now_utc
from .journeys import list_journeys
from .grievances import list_grievances
from .catalog import documents as catalogue_documents, verified_rules
from app.schemas.citizen import (
    AccountView, Application, CitizenSettings, FileUpload, Login, PasswordChange, PasswordCheck,
    PinChange, Profile, ProfileUpdate, Register, WalletUnlock, Workspace, today_india,
)

router = APIRouter(prefix="/citizen", tags=["citizen workspace"])
MAX_FILE = 3 * 1024 * 1024
MAX_BODY = 4 * 1024 * 1024 + 4096
MAX_FILES = 30
FILE_MAGIC = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n", "application/pdf": b"%PDF-"}
class AttemptLimiter:
    def __init__(self, message: str = "Too many account attempts. Try again in 15 minutes."):
        self.message = message
        self.buckets = {}
        self.lock = Lock()

    def consume(self, request: Request):
        address = request.client.host if request.client else "unknown"
        now = monotonic()
        with self.lock:
            if len(self.buckets) >= 2048:
                self.buckets = {key: times for key, times in self.buckets.items() if times[-1] > now - 900}
                if len(self.buckets) >= 2048 and address not in self.buckets:
                    raise ApiError(429, "try_later", "Please wait before trying again.")
            times = self.buckets.setdefault(address, deque())
            while times and times[0] <= now - 900:
                times.popleft()
            if len(times) >= 15:
                raise ApiError(429, "try_later", self.message)
            times.append(now)


def normalized_mobile(value: str) -> str:
    digits = re.sub(r"[\s()-]", "", value)
    return digits[-10:] if re.fullmatch(r"(?:\+?91)?[6-9][0-9]{9}", digits) else ""


SENSITIVE_PROFILE_FIELDS = frozenset({
    "date_of_birth", "parent_name", "guardian_name", "temporary_address", "permanent_address",
    "annual_household_income", "income_range", "disability", "religion", "caste", "reservation_category",
    "ration_status", "dependent",
})


def profile_for(account: CitizenAccount, request: Request) -> Profile:
    values = dict(account.profile)
    protected = values.pop("_protected_v1", None)
    if protected is not None:
        decoded = unseal(request.app.state.settings.wallet_key, b64decode(protected), profile_context(account.id))
        values.update(json.loads(decoded))
    return Profile.model_validate(values)


def present(account: CitizenAccount, request: Request) -> AccountView:
    profile = profile_for(account, request)
    name = " ".join(filter(None, (profile.first_name, profile.middle_name, profile.surname))) or account.name
    return AccountView(name=name[:120], email=account.email, mobile=account.mobile,
                       has_photo=account.photo_mime is not None, profile=profile,
                       settings=CitizenSettings.model_validate(account.settings or {}))


@router.post("/register", status_code=201, response_model=AccountView)
def register(data: Register, request: Request, response: Response, db: Db):
    request.app.state.account_attempts.consume(request)
    email = data.email.casefold()
    mobile = normalized_mobile(data.mobile)
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 254 or not mobile or not data.password.strip():
        raise ApiError(422, "invalid_account", "Enter a valid email, Indian mobile number and password.")
    hashed = password_hash(data.password)
    # The owner row supplies the existing journey/draft foreign key. No anonymous token is issued for it.
    workspace = AnonymousSession(token_hash=secrets.token_hex(32), expires_at=now_utc())
    db.add(workspace)
    db.flush()
    account = CitizenAccount(workspace_id=workspace.id, name=data.name, email=email, mobile=mobile, password_hash=hashed)
    db.add(account)
    try:
        db.flush()
        issue_session(request, response, db, account, False)
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "account_conflict", "An account already uses those details.") from None
    return present(account, request)


@router.post("/login", response_model=AccountView)
def login(data: Login, request: Request, response: Response, db: Db):
    request.app.state.account_attempts.consume(request)
    mobile = normalized_mobile(data.identifier)
    account = db.scalar(select(CitizenAccount).where(or_(
        CitizenAccount.email == data.identifier.casefold(),
        CitizenAccount.mobile == mobile,
    )))
    if not verify_password(data.password, account.password_hash if account else None) or account is None:
        raise ApiError(401, "invalid_credentials", "The email, mobile number or password did not match.")
    issue_session(request, response, db, account, data.remember)
    return present(account, request)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Db):
    revoke_session(request, db)
    db.commit()
    clear_cookie(request, response)


@router.get("/me", response_model=AccountView)
def me(request: Request, account: Account):
    return present(account, request)


@router.patch("/profile", response_model=AccountView)
def update_profile(data: ProfileUpdate, request: Request, account: Account, db: Db):
    if data.email is not None or data.mobile is not None:
        serialize_account(account, db)
        email = data.email.casefold() if data.email is not None else account.email
        mobile = normalized_mobile(data.mobile) if data.mobile is not None else account.mobile
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or not mobile:
            raise ApiError(422, "invalid_contact", "Enter a valid email and Indian mobile number.")
        if (email, mobile) != (account.email, account.mobile):
            confirm_password(request, account, data.password or "")
            account.email, account.mobile = email, mobile
            db.execute(delete(AccountSession).where(AccountSession.account_id == account.id, AccountSession.token_hash != session_key(request)))
            active_session(request, account, db).wallet_until = None
    values = data.model_dump(mode="json", exclude={"consent", "email", "mobile", "password"})
    sensitive = {field: values.pop(field) for field in SENSITIVE_PROFILE_FIELDS}
    sensitive = {field: value for field, value in sensitive.items() if value is not None and value != ""}
    if sensitive:
        encrypted = seal(request.app.state.settings.wallet_key, json.dumps(sensitive).encode(), profile_context(account.id))
        values["_protected_v1"] = b64encode(encrypted).decode("ascii")
    account.profile = values
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "account_conflict", "An account already uses those contact details.") from None
    return present(account, request)

def confirm_password(request: Request, account: Account, password: str):
    request.app.state.account_attempts.consume(request)
    if not verify_password(password, account.password_hash):
        raise ApiError(403, "incorrect_password", "The password did not match.")


@router.post("/delete-account", status_code=204)
def delete_account(data: PasswordCheck, request: Request, response: Response, account: Account, db: Db):
    serialize_account(account, db)
    confirm_password(request, account, data.password)
    workspace_id = account.workspace_id
    db.delete(account)
    db.flush()
    workspace = db.get(AnonymousSession, workspace_id)
    if workspace is not None:
        db.delete(workspace)
    db.commit()
    clear_cookie(request, response)


@router.get("/workspace", response_model=Workspace)
def read_workspace(account: Account):
    return Workspace(version=account.workspace_version, **account.workspace)


@router.patch("/workspace", response_model=Workspace)
def save_workspace(data: Workspace, account: Account, db: Db):
    changes = data.model_dump(mode="json", exclude={"version"})
    previous_dates = account.workspace.get("saved_at", {})
    new_date = now_utc().isoformat()
    existing_saves = set(account.workspace.get("saved", ()))
    changes["saved_at"] = {slug: previous_dates.get(slug, new_date) for slug in data.saved
                           if slug in previous_dates or slug not in existing_saves}
    old_applications = account.workspace.get("applications", {})
    for slug, record in changes["applications"].items():
        previous = old_applications.get(slug, {})
        provided = {key: value for key, value in record.items() if key != "updated_at"}
        previous_fields = Application.model_validate(previous).model_dump(mode="json", exclude={"updated_at"}) if previous else {}
        record["updated_at"] = previous.get("updated_at") if previous_fields == provided else new_date
    result = db.execute(update(CitizenAccount).where(
        CitizenAccount.id == account.id, CitizenAccount.workspace_version == data.version,
    ).values(workspace=changes, workspace_version=data.version + 1))
    if result.rowcount != 1:
        raise ApiError(409, "workspace_changed", "The workspace changed elsewhere. Reload it and try again.")
    db.commit()
    return Workspace(version=data.version + 1, **changes)


def safe_document_name(data: FileUpload) -> str:
    name = re.split(r"[/\\]", data.name)[-1]
    if not name or re.search(r"(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)|[A-Z]{5}\d{4}[A-Z]", name, re.IGNORECASE):
        return data.category + {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}[data.mime]
    return name


def file_metadata(item: CitizenFile):
    return {"id": item.id, "name": item.name, "category": item.category, "mime": item.mime, "size": item.size, "expires_on": item.expires_on, "uploaded_at": aware(item.created_at)}


def owned_file(db: Db, account: Account, file_id: UUID):
    row = db.scalar(select(CitizenFile).where(CitizenFile.account_id == account.id, CitizenFile.id == str(file_id)))
    if row is None:
        raise ApiError(404, "file_not_found", "This document is unavailable.")
    return row


@router.get("/documents")
def documents(account: WalletAccount, db: Db):
    return [file_metadata(item) for item in owned_inventory(account, db)]


def owned_inventory(account: CitizenAccount, db: Db):
    return list(db.scalars(select(CitizenFile).where(
        CitizenFile.account_id == account.id
    ).order_by(CitizenFile.created_at.desc(), CitizenFile.id)))


async def read_upload(request: Request):
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BODY:
            raise ApiError(413, "file_too_large", "Choose a file under 3 MB.")
        body.extend(chunk)
    try:
        data = FileUpload.model_validate_json(body)
        content = b64decode(data.content, validate=True)
    except (ValidationError, BinaryError):
        raise ApiError(422, "invalid_document", "Choose a valid PDF, JPEG or PNG document.") from None
    if len(content) > MAX_FILE:
        raise ApiError(413, "file_too_large", "Choose a file under 3 MB.")
    if not content.startswith(FILE_MAGIC[data.mime]):
        raise ApiError(422, "invalid_document", "The file does not match its declared type.")
    return data, content


@router.post("/documents", status_code=201)
async def upload_document(request: Request, account: WalletAccount, db: Db):
    data, content = await read_upload(request)
    if not wallet_unlocked(active_session(request, account, db)):
        raise ApiError(423, "wallet_locked", "Unlock your document wallet to continue.")
    # Serialise quota checks for the same account across simultaneous uploads.
    db.execute(update(CitizenAccount).where(CitizenAccount.id == account.id).values(updated_at=CitizenAccount.updated_at))
    count = db.scalar(select(func.count()).select_from(CitizenFile).where(CitizenFile.account_id == account.id))
    if count >= MAX_FILES:
        raise ApiError(409, "document_limit", "Remove a document before uploading another.")
    file_id = new_id()
    payload = seal(request.app.state.settings.wallet_key, content, document_context(account.id, file_id))
    item = CitizenFile(id=file_id, account_id=account.id, name=safe_document_name(data), category=data.category,
                       mime=data.mime, size=len(content), expires_on=data.expires_on, payload=payload,
                       encryption_version=1)
    db.add(item)
    db.commit()
    return file_metadata(item)


@router.post("/documents/{file_id}/replace")
async def replace_document(file_id: UUID, request: Request, account: WalletAccount, db: Db):
    data, content = await read_upload(request)
    if not wallet_unlocked(active_session(request, account, db)):
        raise ApiError(423, "wallet_locked", "Unlock your document wallet to continue.")
    item = owned_file(db, account, file_id)
    item.name, item.category, item.mime = safe_document_name(data), data.category, data.mime
    item.size, item.expires_on, item.created_at = len(content), data.expires_on, now_utc()
    item.payload = seal(request.app.state.settings.wallet_key, content, document_context(account.id, item.id))
    item.encryption_version = 1
    db.commit()
    return file_metadata(item)


@router.get("/documents/{file_id}")
def download_document(file_id: UUID, request: Request, account: WalletAccount, db: Db):
    item = owned_file(db, account, file_id)
    payload = item.payload if item.encryption_version is None else unseal(
        request.app.state.settings.wallet_key, item.payload, document_context(account.id, item.id),
    )
    return Response(payload, media_type=item.mime, headers={
        "Content-Disposition": "attachment; filename*=UTF-8''" + quote(item.name, safe=""),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    })


@router.post("/documents/{file_id}/delete", status_code=204)
def delete_document(file_id: UUID, account: WalletAccount, db: Db):
    db.delete(owned_file(db, account, file_id))
    db.commit()


@router.get("/wallet")
def get_wallet(request: Request, account: Account, db: Db):
    session = active_session(request, account, db)
    unlocked = wallet_unlocked(session)
    return {
        "unlocked_until": aware(session.wallet_until) if unlocked else None,
        "local_review_scope": account.id if unlocked else None,
        "uses_mpin": account.mpin_hash is not None,
        "encrypted_storage": request.app.state.settings.wallet_key is not None,
    }


@router.post("/wallet/unlock")
def unlock_wallet(data: WalletUnlock, request: Request, account: Account, db: Db):
    check_wallet_secret(account, db, data.credential)
    session = active_session(request, account, db)
    session.wallet_until = min(now_utc() + WALLET_DURATION, aware(session.expires_at))
    db.commit()
    return get_wallet(request, account, db)


@router.post("/wallet/lock", status_code=204)
def lock_wallet(request: Request, account: Account, db: Db):
    active_session(request, account, db).wallet_until = None
    db.commit()


@router.post("/wallet/mpin", status_code=204)
def update_mpin(data: PinChange, request: Request, account: Account, db: Db):
    serialize_account(account, db)
    confirm_password(request, account, data.password)
    account.mpin_hash = password_hash(data.pin) if data.pin else None
    account.wallet_attempts = 0
    account.wallet_retry_at = None
    db.execute(update(AccountSession).where(AccountSession.account_id == account.id).values(wallet_until=None))
    db.commit()


@router.patch("/settings", response_model=AccountView)
def update_settings(data: CitizenSettings, request: Request, account: Account, db: Db):
    account.settings = data.model_dump(mode="json")
    db.commit()
    return present(account, request)


@router.post("/password", status_code=204)
def change_password(data: PasswordChange, request: Request, response: Response, account: Account, db: Db):
    serialize_account(account, db)
    confirm_password(request, account, data.password)
    if not data.new_password.strip():
        raise ApiError(422, "invalid_password", "Choose a password containing non-space characters.")
    account.password_hash = password_hash(data.new_password)
    db.execute(delete(AccountSession).where(AccountSession.account_id == account.id))
    db.commit()
    clear_cookie(request, response)


@router.post("/export")
def export_data(data: PasswordCheck, request: Request, account: WalletAccount, db: Db):
    confirm_password(request, account, data.password)
    return {
        "account": present(account, request), "workspace": read_workspace(account),
        "journeys": list_journeys(account.workspace_id, db),
        "grievance_drafts": list_grievances(account.workspace_id, db),
        "documents": [file_metadata(item) for item in owned_inventory(account, db)],
    }


@router.get("/photo")
def get_photo(request: Request, account: Account):
    if account.photo is None:
        raise ApiError(404, "photo_unavailable", "No profile photo is saved.")
    payload = unseal(request.app.state.settings.wallet_key, account.photo, photo_context(account.id))
    return Response(payload, media_type=account.photo_mime, headers={
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    })


@router.post("/photo", status_code=204)
async def set_photo(request: Request, account: Account, db: Db):
    data, content = await read_upload(request)
    if data.mime not in ("image/jpeg", "image/png") or len(content) > 1024 * 1024:
        raise ApiError(422, "invalid_photo", "Choose a JPEG or PNG photo under 1 MB.")
    account.photo = seal(request.app.state.settings.wallet_key, content, photo_context(account.id))
    account.photo_mime = data.mime
    db.commit()


@router.delete("/photo", status_code=204)
def remove_photo(account: Account, db: Db):
    account.photo = None
    account.photo_mime = None
    db.commit()


@router.get("/wallet/expiry")
def wallet_expiry(account: WalletAccount, db: Db):
    settings = CitizenSettings.model_validate(account.settings or {})
    if not settings.notifications or not settings.expiry_alerts:
        return []
    today = today_india()
    alerts = []
    for item in owned_inventory(account, db):
        if item.expires_on is None:
            continue
        days = (item.expires_on - today).days
        if 0 <= days <= 30:
            alerts.append({"document": file_metadata(item), "days_left": days,
                           "milestone": next(limit for limit in (7, 15, 30) if days <= limit)})
    return sorted(alerts, key=lambda alert: alert["days_left"])


def evaluate_rule(rule: EligibilityRule, profile: Profile):
    value = profile.model_dump().get(rule.field)
    expected = rule.expected_value
    if value in (None, "") or rule.field == "dependent":
        return None
    if rule.operator == "eq" and type(value) is type(expected):
        return value.casefold() == expected.casefold() if isinstance(value, str) else value == expected
    if rule.operator == "in" and isinstance(expected, list) and all(type(item) is type(value) for item in expected):
        return any(value.casefold() == item.casefold() if isinstance(value, str) else value == item for item in expected)
    if type(value) in (int, float) and type(expected) in (int, float):
        if rule.operator == "gte":
            return value >= expected
        if rule.operator == "lte":
            return value <= expected
    return None


@router.get("/eligibility")
def eligibility(request: Request, account: Account, db: Db):
    profile = profile_for(account, request)
    rows = db.execute(verified_rules())
    by_service = {}
    for rule, source in rows:
        by_service.setdefault(rule.service_id, []).append({
            "explanation": rule.explanation, "field": rule.field, "met": evaluate_rule(rule, profile),
            "source_url": source.source_url,
        })
    results = []
    for service in db.scalars(select(Service).order_by(Service.name)):
        checks = by_service.get(service.id, [])
        known = sum(check["met"] is True for check in checks)
        status = "Needs More Information"
        unmatched = sum(check["met"] is False for check in checks)
        unknown = len(checks) - known - unmatched
        if checks and unknown == 0:
            if unmatched:
                status = "Not Eligible"
            elif service.catalogue is None:
                status = "Likely Eligible"
        assessment_state = ("not_eligible" if unmatched else "insufficient_information" if not checks or unknown
                            else "eligible" if status == "Likely Eligible" else "potentially_eligible")
        if unmatched:
            status = "Not Eligible"
        results.append({"slug": service.slug, "status": status, "assessment_state": assessment_state, "met": known, "unmatched": unmatched,
                        "unknown": unknown, "total": len(checks), "checks": checks,
                        "match_percentage": round(known * 100 / len(checks)) if known or unmatched else None})
    return results


@router.get("/readiness/{slug}")
def readiness(slug: str, account: WalletAccount, db: Db):
    requirements = catalogue_documents(slug, db).items
    inventory = owned_inventory(account, db)
    today = today_india()
    rows = []
    for requirement in requirements:
        accepted = accepted_document_categories(slug, requirement.inventory_category)
        matched = [item for item in inventory if item.category in accepted]
        active = [item for item in matched if item.expires_on is None or item.expires_on >= today]
        status = "uploaded" if active else "expired" if matched else "missing" if requirement.inventory_category else "unmapped"
        rows.append({"requirement": requirement, "status": status, "files": [file_metadata(item) for item in matched]})
    required = [row for row in rows if row["requirement"].required_status == "required"]
    ready = sum(row["status"] == "uploaded" for row in required)
    return {"items": rows, "required": len(required), "uploaded": ready,
            "percentage": round(ready * 100 / len(required)) if required else None}
