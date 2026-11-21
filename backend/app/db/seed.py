from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.config import load_settings

from .catalogue_seed import seed_catalogue
from .database import make_engine
from .models import Service, ServiceSource

# Dates record the source review of these catalog entries, not a fresh portal
# check each time someone runs the seed command.
REVIEWED_AT = datetime(2026, 11, 20, tzinfo=UTC)
SEVA_SINDHU = "https://sevasindhu.karnataka.gov.in/Sevasindhu/English"
CERTIFICATES = ("https://vijayapura.nic.in/en/service/certificates-ajsk/", "Vijayapura district certificate services")
GRUHA_PUBLICATION = (
    "https://fpibengaluru.karnataka.gov.in/uploads/media_to_upload1762775086.pdf",
    "Fiscal Policy Institute assessment of Karnataka schemes",
)

SERVICES = [
    ("eshram", "eShram", "National portal for workers in the unorganised sector.", "Employment",
     "Central", None, "Ministry of Labour & Employment", "https://eshram.gov.in/", "eShram portal",
     ("https://eshram.gov.in/faqs", "Ministry of Labour & Employment eShram FAQs")),
    ("scholarships", "National Scholarship Portal", "A portal to discover and manage scholarship applications.",
     "Education", "Central", None, None, "https://scholarships.gov.in/", "National Scholarship Portal",
     ("https://mon.nic.in/scheme/national-scholarship-portal/", "National Scholarship Portal scheme reference")),
    ("income-certificate", "Karnataka Income Certificate", "Karnataka Revenue Department service for income certification.",
     "Certificates", "State", "Karnataka", "Karnataka Revenue Department", SEVA_SINDHU, "Karnataka Seva Sindhu", CERTIFICATES),
    ("caste-certificate", "Karnataka Caste Certificate", "Karnataka Revenue Department service for caste certification.",
     "Certificates", "State", "Karnataka", "Karnataka Revenue Department", SEVA_SINDHU, "Karnataka Seva Sindhu", CERTIFICATES),
    ("gruha-lakshmi", "Karnataka Gruha Lakshmi", "A Karnataka welfare scheme focused on household financial support.",
     "Welfare", "State", "Karnataka", "Karnataka Department of Women and Child Development", SEVA_SINDHU,
     "Karnataka Seva Sindhu", GRUHA_PUBLICATION),
]


def seed(db: Session) -> None:
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgres_insert
    for slug, name, description, category, jurisdiction, state, department, url, portal, source in SERVICES:
        db.execute(insert(Service).values(
            slug=slug, name=name, description=description, category=category, jurisdiction=jurisdiction,
            state=state, department=department, official_url=url,
            verification_status="verified", last_verified_at=REVIEWED_AT,
        ).on_conflict_do_nothing(index_elements=["slug"]))
        service_id = db.scalar(select(Service.id).where(Service.slug == slug))
        for source_url, title, source_type in [
            (url, portal, "government_portal"), (*source, "government_publication"),
        ]:
            db.execute(insert(ServiceSource).values(
                service_id=service_id, source_url=source_url, source_title=title,
                source_type=source_type, checked_at=REVIEWED_AT,
            ).on_conflict_do_nothing(index_elements=["service_id", "source_url"]))
    db.commit()


def main() -> None:
    engine = make_engine(load_settings().database_url)
    try:
        with Session(engine) as db:
            seed(db)
            catalogue_count = seed_catalogue(db)
    finally:
        engine.dispose()
    print(f"Seed ensured the baseline and {catalogue_count} Task 04 catalogue entries.")


if __name__ == "__main__":
    main()
