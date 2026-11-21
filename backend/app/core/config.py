from base64 import b64decode
from binascii import Error as Base64Error
from dataclasses import dataclass, field
import os
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv
from sqlalchemy.engine import make_url
from .jansetu_provider import ProviderSettings

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173"


@dataclass(frozen=True)
class Settings:
    database_url: str
    cors_origins: tuple[str, ...]
    session_cookie_secure: bool = False
    session_ttl_days: int = 30
    wallet_key: bytes | None = None
    maps_geocoding_key: str | None = None
    centre_directory_live: bool = False
    jansetu: ProviderSettings = field(default_factory=ProviderSettings)


def load_settings() -> Settings:
    load_dotenv(BACKEND_DIR / ".env")
    raw_url = os.environ.get("DATABASE_URL", "sqlite:///sevapath.db").strip()
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif raw_url.startswith("postgresql://"):
        raw_url = raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    url = make_url(raw_url)
    if url.get_backend_name() == "sqlite" and url.database not in (None, "", ":memory:"):
        if not Path(url.database).is_absolute():
            url = url.set(database=str(BACKEND_DIR / url.database))

    origins = tuple(dict.fromkeys(part.strip() for part in os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS).split(",") if part.strip()))
    for origin in origins:
        parsed = urlsplit(origin)
        if (
            parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username is not None or origin != f"{parsed.scheme}://{parsed.netloc}"
            or "*" in origin
        ):
            raise ValueError("CORS_ORIGINS must contain exact http(s) origins without paths")

    secure = os.getenv("SESSION_COOKIE_SECURE", "false").strip().lower()
    if secure not in {"true", "false"}:
        raise ValueError("SESSION_COOKIE_SECURE must be true or false")
    ttl = int(os.getenv("SESSION_TTL_DAYS", "30"))
    if not 1 <= ttl <= 365:
        raise ValueError("SESSION_TTL_DAYS must be between 1 and 365")

    key = os.getenv("WALLET_ENCRYPTION_KEY", "").strip()
    try:
        decoded_key = b64decode(key, altchars=b"-_", validate=True) if key else None
    except Base64Error:
        raise ValueError("WALLET_ENCRYPTION_KEY must be a base64-encoded 32-byte key") from None
    if decoded_key is not None and len(decoded_key) != 32:
        raise ValueError("WALLET_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
    directory_live = os.getenv("CENTRE_DIRECTORY_LIVE", "true").strip().lower()
    if directory_live not in {"true", "false"}:
        raise ValueError("CENTRE_DIRECTORY_LIVE must be true or false")
    return Settings(url.render_as_string(hide_password=False), origins, secure == "true", ttl, decoded_key,
                    os.getenv("MAPS_GEOCODING_SERVER_KEY", "").strip() or None, directory_live == "true", ProviderSettings.from_environment())
