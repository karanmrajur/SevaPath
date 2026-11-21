from alembic import context

from app.core.config import load_settings
from app.db.database import Base, make_engine
from app.db import citizen_models, models  # noqa: F401 — imports register the tables on Base

database_url = load_settings().database_url
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=database_url, target_metadata=target_metadata, literal_binds=True,
        dialect_opts={"paramstyle": "named"}, compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = make_engine(database_url)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata,
                              compare_type=True, render_as_batch=engine.dialect.name == "sqlite")
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
