import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.database import Base, make_engine
from app.db.seed import seed
from app.main import create_app

FRONTEND = "http://127.0.0.1:5173"


@pytest.fixture
def engine():
    database = make_engine("sqlite:///:memory:")
    Base.metadata.create_all(database)
    with Session(database) as db:
        seed(db)
    try:
        yield database
    finally:
        database.dispose()


@pytest.fixture
def app(engine):
    return create_app(Settings("sqlite:///:memory:", (FRONTEND,), wallet_key=bytes(range(32))), engine=engine)


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
