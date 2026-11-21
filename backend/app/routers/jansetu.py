from asyncio import Semaphore, timeout
from base64 import b64decode
from binascii import Error as Base64Error
from collections import deque
from threading import Lock
from time import monotonic
from typing import Annotated, Literal
from urllib.parse import urlsplit
import re

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError
from sqlalchemy import select

from app.core.accounts import Account
from app.core.document_requirements import accepted_document_categories
from app.core.errors import ApiError
from app.core.jansetu_provider import Provider, ProviderError, ProviderSettings
from app.core.jansetu_search import CATEGORIES, INJECTION, INTENTS, STATES, can_send, has, normalized, parse, rank
from app.core.wallet import require_wallet
from app.db.citizen_models import CitizenFile
from app.db.database import Db
from app.db.models import EligibilityRule, Service, ServiceDocument, ServiceSource
from app.schemas.citizen import Profile, today_india
from .catalog import OFFICIAL_SOURCES, dependencies, verified_documents, verified_rules
from .citizen import SENSITIVE_PROFILE_FIELDS, evaluate_rule, profile_for

router = APIRouter(prefix="/citizen/assistant", tags=["JanSetu"])
Language = Literal["en-IN", "hi-IN", "kn-IN"]
Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,119}$")]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Context(Input):
    intent: str = Field(default="find", max_length=24)
    category: str | None = Field(default=None, max_length=30)
    state: str | None = Field(default=None, max_length=30)
    slugs: list[Slug] = Field(default_factory=list, max_length=4)


class Chat(Input):
    message: str = Field(min_length=1, max_length=800)
    language: Language = "en-IN"
    context: Context = Field(default_factory=Context)
    provider_consent: bool = False


class Checks(Input):
    consent: Literal[True]
    scope: Literal["profile", "wallet"]
    slugs: list[Slug] = Field(default_factory=list, max_length=4)


class Audio(Input):
    consent: Literal[True]
    language: Language
    mime: Literal["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"]
    audio: str = Field(min_length=12, max_length=2_800_000)


class Runtime:
    def __init__(self, settings: ProviderSettings):
        self.settings = settings
        self.provider = Provider(settings)
        self.active = Semaphore(4)
        self.buckets: dict[str, deque] = {}
        self.lock = Lock()

    def rate_limit(self, account_id: str):
        with self.lock:
            now = monotonic()
            if len(self.buckets) >= 2048:
                self.buckets = {key: values for key, values in self.buckets.items() if values and now - values[-1] < 60}
            if account_id not in self.buckets and len(self.buckets) >= 2048:
                raise ApiError(429, "assistant_rate_limited", "JanSetu is busy. Try again shortly.")
            stamps = self.buckets.setdefault(account_id, deque())
            while stamps and now - stamps[0] >= 60:
                stamps.popleft()
            if len(stamps) >= 12:
                raise ApiError(429, "assistant_rate_limited", "Too many JanSetu requests. Try again in a minute.")
            stamps.append(now)


async def body(request: Request, schema: type[Input], limit: int = 7_000):
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > limit:
            raise ApiError(413, "assistant_request_too_large", "This JanSetu request is too large.")
        data.extend(chunk)
    try:
        return schema.model_validate_json(data)
    except ValidationError:
        raise ApiError(422, "assistant_invalid_request", "Check the question, language and consent settings.") from None


def safe_url(url: str | None):
    parsed = urlsplit(url or "")
    return url if parsed.scheme in {"https", "http"} and parsed.hostname and not parsed.username else None


def source_card(source):
    if url := safe_url(source.source_url):
        return {"title": source.source_title, "url": url, "checked_at": source.checked_at,
                "official": source.source_type in OFFICIAL_SOURCES and source.checked_at is not None}
    return None


def cards(db, services: list[Service], intent: str):
    if not services:
        return []
    ids = [service.id for service in services]
    sources = db.scalars(select(ServiceSource).where(ServiceSource.service_id.in_(ids))
                         .order_by(ServiceSource.checked_at.desc(), ServiceSource.id)).all()
    rules = db.execute(verified_rules().where(EligibilityRule.service_id.in_(ids))).all()
    documents = db.execute(verified_documents().where(ServiceDocument.service_id.in_(ids))).all()
    results = []
    for service in services:
        published = service.catalogue or {}
        references = list(filter(None, (source_card(s) for s in sources if s.service_id == service.id)))
        official = service.verification_status == "verified" and any(s["official"] for s in references)
        official_links = [s for s in references if s["official"]]
        public_portal = safe_url(published.get("official_application_url")) if official else None
        prerequisites = []
        if intent in {"documents", "apply", "find", "eligibility"}:
            prerequisites = [{"name": link.prerequisite_service.name, "slug": link.prerequisite_service.slug,
                              "condition": link.condition, "source": source_card(link.source)}
                             for link in dependencies(service.slug, db).items]
        results.append({
            "slug": service.slug, "name": service.name, "state": service.state, "jurisdiction": service.jurisdiction,
            "verification": "verified" if official else "unverified", "checked_at": service.last_verified_at,
            "overview": published.get("overview") or service.description,
            "application_url": public_portal,
            "information_url": (safe_url(published.get("official_information_url")) if official else None)
                               or (official_links[0]["url"] if official_links else None),
            "procedure": published.get("procedure", []) if official else [],
            "eligibility_guidance": published.get("eligibility_guidance", []) if official else [],
            "deadline": published.get("application_deadline") if official else None,
            "requirements": [{"id": item.id, "name": item.document_name, "status": item.required_status,
                              "source": source_card(ref)} for item, ref in documents if item.service_id == service.id],
            "rules": [{"explanation": rule.explanation, "source": source_card(ref)}
                      for rule, ref in rules if rule.service_id == service.id],
            "sources": official_links + [s for s in references if not s["official"]][:2],
            "prerequisites": prerequisites,
        })
    return results


@router.get("/status")
def status(request: Request, account: Account):
    settings = request.app.state.jansetu.settings
    return {"provider_configured": settings.ai_ready, "general_enabled": settings.ai_ready and settings.general,
            "speech_languages": settings.speech_languages if settings.speech_ready else []}


MESSAGES = {
    "en-IN": {
        "find": "Here are relevant catalogue entries and their sources.",
        "documents": "These are the published document requirements. Use the private checks for your own readiness.",
        "eligibility": "Eligibility depends on the published conditions. You can run a private profile or document check below.",
        "apply": "Review the published steps and use the official portal when a link is available.",
        "deadline": "The cards show the dates recorded in the catalogue. Confirm current deadlines with the issuing authority.",
        "state": "Which state are you looking for farmer schemes in?",
        "which": "Which scheme or service would you like to check?",
        "none": "I couldn’t find a reliable catalogue match. What is the name or topic of the service?",
        "centres": "Which Karnataka city, district or PIN code should I look up?",
        "centre_results": "These are the matching listings from the existing service centre directory.",
        "centre_empty": "The directory has no matching listing. Try the city, district or PIN code in the centre finder.",
        "expiry": "Use the private wallet check to see the next recorded expiry.",
        "consistency": "Open Document Consistency Check and share only the outcome using its JanSetu action.",
        "features": "SevaPath has a service catalogue, private wallet, local document checks and a service centre finder.",
        "blocked": "Use a public scheme name or topic and remove personal identifiers or private document details.",
    },
    "hi-IN": {
        "find": "कैटलॉग में ये सेवाएँ और उनके स्रोत मिले।",
        "documents": "ये प्रकाशित दस्तावेज़ आवश्यकताएँ हैं। अपने दस्तावेज़ों के लिए निजी जाँच करें।",
        "eligibility": "पात्रता प्रकाशित शर्तों पर निर्भर है। नीचे निजी जाँच करें।",
        "apply": "प्रकाशित चरण देखें और लिंक उपलब्ध हो तो आधिकारिक पोर्टल खोलें।",
        "deadline": "कार्ड में कैटलॉग की तारीखें हैं। वर्तमान अंतिम तारीख जारीकर्ता से जाँचें।",
        "state": "आप किस राज्य की किसान योजनाएँ देखना चाहते हैं?",
        "which": "आप किस योजना या सेवा की जाँच करना चाहते हैं?",
        "none": "कैटलॉग में भरोसेमंद नतीजा नहीं मिला। सेवा का नाम या विषय बताइए।",
        "centres": "कर्नाटक का कौन सा शहर, ज़िला या पिन कोड खोजूँ?",
        "centre_results": "सेवा केंद्र निर्देशिका में ये केंद्र मिले।",
        "centre_empty": "कोई केंद्र नहीं मिला। केंद्र खोज में शहर, ज़िला या पिन कोड आज़माएँ।",
        "expiry": "अगली दर्ज समाप्ति तारीख के लिए निजी वॉलेट जाँच करें।",
        "consistency": "दस्तावेज़ मिलान खोलें और जनसेतु के साथ केवल उसका नतीजा साझा करें।",
        "features": "सेवापथ में सेवा कैटलॉग, निजी वॉलेट, स्थानीय दस्तावेज़ जाँच और केंद्र खोज हैं।",
        "blocked": "सार्वजनिक योजना का नाम लिखें और निजी पहचान विवरण हटाएँ।",
    },
    "kn-IN": {
        "find": "ಕ್ಯಾಟಲಾಗ್‌ನಲ್ಲಿ ಹೊಂದುವ ಸೇವೆಗಳು ಮತ್ತು ಅವುಗಳ ಮೂಲಗಳು ಇಲ್ಲಿವೆ.",
        "documents": "ಇವು ಪ್ರಕಟಿತ ದಾಖಲೆ ಅವಶ್ಯಕತೆಗಳು. ನಿಮ್ಮ ದಾಖಲೆಗಳಿಗೆ ಖಾಸಗಿ ಪರಿಶೀಲನೆ ಬಳಸಿ.",
        "eligibility": "ಅರ್ಹತೆಯು ಪ್ರಕಟಿತ ಷರತ್ತುಗಳನ್ನು ಅವಲಂಬಿಸಿದೆ. ಕೆಳಗೆ ಖಾಸಗಿ ಪರಿಶೀಲನೆ ಮಾಡಿ.",
        "apply": "ಪ್ರಕಟಿತ ಹಂತಗಳನ್ನು ನೋಡಿ. ಲಿಂಕ್ ಇದ್ದರೆ ಅಧಿಕೃತ ಪೋರ್ಟಲ್ ತೆರೆಯಿರಿ.",
        "deadline": "ಕಾರ್ಡ್‌ಗಳಲ್ಲಿ ಕ್ಯಾಟಲಾಗ್‌ನ ದಿನಾಂಕಗಳಿವೆ. ಪ್ರಸ್ತುತ ಕೊನೆಯ ದಿನಾಂಕವನ್ನು ಇಲಾಖೆಯಿಂದ ಪರಿಶೀಲಿಸಿ.",
        "state": "ಯಾವ ರಾಜ್ಯದ ರೈತ ಯೋಜನೆಗಳನ್ನು ಹುಡುಕುತ್ತಿದ್ದೀರಿ?",
        "which": "ಯಾವ ಯೋಜನೆ ಅಥವಾ ಸೇವೆಯನ್ನು ಪರಿಶೀಲಿಸಲು ಬಯಸುತ್ತೀರಿ?",
        "none": "ಕ್ಯಾಟಲಾಗ್‌ನಲ್ಲಿ ಹೊಂದುವ ಸೇವೆ ಸಿಗಲಿಲ್ಲ. ಸೇವೆಯ ಹೆಸರು ಅಥವಾ ವಿಷಯ ತಿಳಿಸಿ.",
        "centres": "ಕರ್ನಾಟಕದ ಯಾವ ನಗರ, ಜಿಲ್ಲೆ ಅಥವಾ ಪಿನ್ ಕೋಡ್ ಹುಡುಕಲಿ?",
        "centre_results": "ಸೇವಾ ಕೇಂದ್ರ ನಿರ್ದೇಶಿಕೆಯಲ್ಲಿ ಈ ಕೇಂದ್ರಗಳು ಹೊಂದಿವೆ.",
        "centre_empty": "ಹೊಂದುವ ಕೇಂದ್ರ ಸಿಗಲಿಲ್ಲ. ನಗರ, ಜಿಲ್ಲೆ ಅಥವಾ ಪಿನ್ ಕೋಡ್ ಪ್ರಯತ್ನಿಸಿ.",
        "expiry": "ಮುಂದಿನ ಮುಕ್ತಾಯ ದಿನಾಂಕಕ್ಕಾಗಿ ಖಾಸಗಿ ವಾಲೆಟ್ ಪರಿಶೀಲನೆ ಮಾಡಿ.",
        "consistency": "ದಾಖಲೆ ಹೊಂದಾಣಿಕೆ ಪರಿಶೀಲನೆಯನ್ನು ತೆರೆದು ಫಲಿತಾಂಶವನ್ನು ಮಾತ್ರ ಜನಸೇತುಗೆ ಹಂಚಿಕೊಳ್ಳಿ.",
        "features": "ಸೇವಾಪಥದಲ್ಲಿ ಸೇವಾ ಕ್ಯಾಟಲಾಗ್, ಖಾಸಗಿ ವಾಲೆಟ್, ಸ್ಥಳೀಯ ದಾಖಲೆ ಪರಿಶೀಲನೆ ಮತ್ತು ಕೇಂದ್ರ ಹುಡುಕಾಟವಿದೆ.",
        "blocked": "ಸಾರ್ವಜನಿಕ ಯೋಜನೆಯ ಹೆಸರನ್ನು ಬಳಸಿ ಮತ್ತು ಖಾಸಗಿ ಗುರುತು ವಿವರಗಳನ್ನು ತೆಗೆದುಹಾಕಿ.",
    },
}
CITY_ALIASES = {"ಬೆಂಗಳೂರು": "bengaluru", "बेंगलुरु": "bengaluru", "bangalore": "bengaluru",
                "ಮೈಸೂರು": "mysuru", "मैसूर": "mysuru", "mysore": "mysuru",
                "ಹುಬ್ಬಳ್ಳಿ": "hubballi", "हुबली": "hubballi", "hubli": "hubballi",
                "ಧಾರವಾಡ": "dharwad", "धारवाड़": "dharwad", "ಕೊಡಗು": "kodagu"}


async def centres_for(request: Request, query: str):
    items, _ = await request.app.state.centre_directory.get()
    for alias, city in CITY_ALIASES.items():
        if has(query, alias):
            query += " " + city
    terms = re.findall(r"(?<!\d)\d{6}(?!\d)", query)
    matches = [item for item in items if (item.get("pin") in terms or any(
        name and has(query, name) for name in (item.get("city"), item.get("district"), *item.get("aliases", []))
    )) and safe_url(item.get("source"))]
    return [{
        "name": item["name"], "address": item["address"], "type": item["centre_type"], "source": item["source"],
        "checked_at": item.get("verification_date") or item.get("verified_on"),
    } for item in matches[:5]], bool(terms or matches)


@router.post("/chat")
async def chat(request: Request, account: Account, db: Db):
    runtime = request.app.state.jansetu
    runtime.rate_limit(account.id)
    data = await body(request, Chat)
    message = data.message.strip()
    if not normalized(message):
        raise ApiError(422, "assistant_empty_question", "Enter a question.")
    query, state, category, intent = parse(message)
    words = MESSAGES[data.language]
    context = data.context
    previous_intent = context.intent if context.intent in INTENTS else "find"
    previous_category = context.category if context.category in CATEGORIES else None
    previous_state = context.state if context.state in STATES else None
    services = db.scalars(select(Service).order_by(Service.id)).all()
    by_slug = {service.slug: service for service in services}
    previous = [slug for slug in dict.fromkeys(context.slugs) if slug in by_slug]
    new_state, new_category = state, category
    follow_up = bool(state and len(query.split()) <= 3 or intent in {"documents", "eligibility", "apply", "deadline"})
    if previous_intent == "centres" and intent == "find" and len(query.split()) <= 4:
        intent = "centres"
    if follow_up and not category:
        category = previous_category
    state = state or (previous_state if follow_up else None)
    selected, exact = rank(services, query, category, state)
    if follow_up and previous and not exact and not new_category and not new_state:
        selected = [by_slug[slug] for slug in previous if not state or by_slug[slug].state in (None, state)]
    mode = "setup_required" if not runtime.settings.ai_ready else "catalogue"
    general = None
    safe = can_send(message)
    if INJECTION.search(message):
        return {"mode": mode, "intent": "find", "answer": words["blocked"], "services": [], "centres": [],
                "context": Context(), "follow_ups": []}

    safe_context = {"intent": previous_intent, "category": previous_category, "state": previous_state, "slugs": previous}
    relevant = [service for service in services if not state or service.state in (None, state)]
    public_topic = any(has(query, word) for word in ("government", "scheme", "service", "benefit", "application",
        "सरकारी", "सरकार", "योजना", "सेवा", "ಸರ್ಕಾರಿ", "ಸರ್ಕಾರ", "ಯೋಜನೆ", "ಸೇವೆ"))
    if data.provider_consent and runtime.settings.ai_ready and safe and intent not in {"expiry", "consistency"}:
        try:
            async with timeout(40), runtime.active:
                pool = selected or relevant
                hint = "general" if intent == "find" and not selected and not category and not state and not public_topic else intent
                if hint == "general" and runtime.settings.general:
                    general = await runtime.provider.general(message, data.language, {})
                    general = re.sub(r"https?://\S+", "", general).strip()
                    mode = "ai_general"
                    intent = "general"
                else:
                    index = [{"slug": item.slug, "name": item.name} for item in pool]
                    plan = await runtime.provider.plan(message, data.language, index, safe_context, hint)
                    mode = "ai_grounded"
                    chosen_intent = plan.get("intent")
                    if intent == "find" and not category and isinstance(chosen_intent, str) and chosen_intent in INTENTS:
                        intent = chosen_intent
                    raw = plan.get("slugs")
                    allowed = {item.slug for item in pool}
                    slugs = list(dict.fromkeys(slug for slug in raw[:4] if isinstance(slug, str) and slug in allowed)) if isinstance(raw, list) else []
                    if slugs and not exact and not selected:
                        selected = [by_slug[slug] for slug in slugs]
                    if slugs and not category and isinstance(plan.get("category"), str) and plan["category"] in CATEGORIES:
                        category = plan["category"]
        except (ProviderError, TimeoutError):
            mode = "provider_unavailable"
    elif data.provider_consent and not safe:
        mode = "private_text"

    listings = []
    decision = intent
    if intent == "centres":
        selected = []
        listings, attempted = await centres_for(request, query)
        decision = "centre_results" if listings else "centre_empty" if attempted else "centres"
    elif intent in {"features", "expiry", "consistency"}:
        selected = []
    elif category == "Farmers" and not state and not exact and intent == "find":
        selected = []
        decision = "state"
    elif not selected and intent in {"documents", "eligibility", "apply", "deadline"}:
        decision = intent if intent in {"documents", "eligibility"} else "which"
    elif not selected:
        decision = "blocked" if not safe else "none"
    elif intent == "general":
        intent = decision = "find"
    return {
        "mode": mode, "intent": intent, "answer": general or words[decision],
        "services": cards(db, selected, intent), "centres": listings,
        "context": Context(intent=intent, category=category, state=state, slugs=[item.slug for item in selected]),
        "follow_ups": ["documents", "apply", "eligibility"] if selected else [],
    }


@router.post("/checks")
async def checks(request: Request, account: Account, db: Db):
    request.app.state.jansetu.rate_limit(account.id)
    data = await body(request, Checks)
    selected = set(data.slugs)
    services = {item.id: item for item in db.scalars(select(Service)).all() if not selected or item.slug in selected}
    if data.scope == "profile":
        checks = db.execute(verified_rules().where(EligibilityRule.service_id.in_(services))).all()
        fields = {rule.field for rule, _ in checks}
        if fields & (SENSITIVE_PROFILE_FIELDS | {"age"}) and account.profile.get("_protected_v1"):
            profile = profile_for(account, request)
        else:
            profile = Profile.model_validate({field: account.profile[field] for field in fields if field in account.profile})
        groups = {}
        for rule, ref in checks:
            groups.setdefault(rule.service_id, []).append({
                "explanation": rule.explanation, "met": evaluate_rule(rule, profile), "source": source_card(ref),
            })
        result = []
        for identifier, service in services.items():
            conditions = groups.get(identifier, [])
            if not conditions and not selected:
                continue
            state = "not_eligible" if any(check["met"] is False for check in conditions) else (
                "eligible" if conditions and all(check["met"] is True for check in conditions) and service.catalogue is None
                else "potentially_eligible")
            result.append({"slug": service.slug, "name": service.name, "status": state, "checks": conditions,
                           "partial": bool(service.catalogue) or not conditions})
        result.sort(key=lambda item: (item["status"] == "not_eligible", not any(x["met"] is True for x in item["checks"])))
        return {"scope": "profile", "items": result[:10]}

    require_wallet(request, account, db)
    inventory = db.execute(select(CitizenFile.category, CitizenFile.expires_on).where(CitizenFile.account_id == account.id)).all()
    today = today_india()
    expirations = sorted(set((expiry, category) for category, expiry in inventory if expiry and expiry >= today))[:6]
    by_service = {}
    for item, ref in db.execute(verified_documents()):
        if item.service_id not in services:
            continue
        service = services[item.service_id]
        recognized = accepted_document_categories(service.slug, item.inventory_category)
        matching = [expiry for category, expiry in inventory if category in recognized]
        valid = any(expiry is None or expiry >= today for expiry in matching)
        state = "available" if valid else "review" if matching or not recognized else "missing"
        by_service.setdefault(service.id, []).append({
            "id": item.id, "name": item.document_name, "status": item.required_status, "state": state,
            "expiring": min((expiry for expiry in matching if expiry and 0 <= (expiry - today).days <= 30), default=None),
            "source": source_card(ref),
        })
    result = []
    for identifier, service in services.items():
        rows = by_service.get(identifier, [])
        required = [row for row in rows if row["status"] == "required"]
        available = sum(row["state"] == "available" for row in required)
        if not selected and not available:
            continue
        result.append({"slug": service.slug, "name": service.name, "required": len(required), "available": available,
                       "percentage": round(100 * available / len(required)) if required else None, "items": rows})
    result.sort(key=lambda item: (-item["available"], -(item["percentage"] or 0), item["name"]))
    return {"scope": "wallet", "items": result[:8],
            "expires": [{"category": category, "date": expiry} for expiry, category in expirations]}


@router.post("/transcribe")
async def transcribe(request: Request, account: Account):
    runtime = request.app.state.jansetu
    runtime.rate_limit(account.id)
    data = await body(request, Audio, 2_810_000)
    if not runtime.settings.speech_ready or data.language not in runtime.settings.speech_languages:
        raise ApiError(503, "speech_not_configured", "Transcription for this language is unavailable.")
    try:
        audio = b64decode(data.audio, validate=True)
    except (ValueError, Base64Error):
        raise ApiError(422, "bad_audio", "The audio recording could not be read.") from None
    signatures = {"audio/webm": (0, b"\x1a\x45\xdf\xa3"), "audio/ogg": (0, b"OggS"),
                  "audio/wav": (0, b"RIFF"), "audio/mp4": (4, b"ftyp")}
    offset, signature = signatures[data.mime]
    if len(audio) > 2_000_000 or not audio.startswith(signature, offset):
        raise ApiError(422, "bad_audio", "The audio recording format or size is unsupported.")
    try:
        async with timeout(28), runtime.active:
            return {"text": await runtime.provider.transcribe(audio, data.mime, data.language)}
    except (ProviderError, TimeoutError):
        raise ApiError(503, "speech_unavailable", "Transcription failed. You can continue by typing.") from None
