"""Encrypt files uploaded before revision 0004 using the configured wallet key."""
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import load_settings
from app.core.wallet import document_context, seal

from .citizen_models import CitizenFile
from .database import make_engine


def encrypt_legacy_files(db: Session, key: bytes) -> int:
    count = 0
    ids = list(db.scalars(select(CitizenFile.id).where(CitizenFile.encryption_version.is_(None))))
    for file_id in ids:
        # Lock the row before reading its bytes so a concurrent replacement stays encrypted.
        locked = db.execute(update(CitizenFile).where(
            CitizenFile.id == file_id, CitizenFile.encryption_version.is_(None),
        ).values(size=CitizenFile.size))
        if locked.rowcount != 1:
            continue
        item = db.get(CitizenFile, file_id)
        item.payload = seal(key, item.payload, document_context(item.account_id, item.id))
        item.encryption_version = 1
        count += 1
    db.commit()
    return count


def main():
    settings = load_settings()
    if settings.wallet_key is None:
        raise SystemExit("Configure WALLET_ENCRYPTION_KEY before encrypting legacy files.")
    engine = make_engine(settings.database_url)
    try:
        with Session(engine) as db:
            count = encrypt_legacy_files(db, settings.wallet_key)
    finally:
        engine.dispose()
    print(f"Encrypted {count} legacy wallet files.")


if __name__ == "__main__":
    main()
