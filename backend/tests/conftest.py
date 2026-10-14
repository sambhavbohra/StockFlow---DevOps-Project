"""Tests run against a dedicated PostgreSQL database whose name must end in `_test`.

Set TEST_DATABASE_URL (see .env.example). The app's DATABASE_URL is overridden before the app is
imported, so tests can never touch the development or production database.
"""
import os
from pathlib import Path

import pytest
from sqlalchemy.engine import make_url

TEST_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_URL:
    raise RuntimeError("TEST_DATABASE_URL is not set. Tests need a dedicated *_test database.")
if not (make_url(TEST_URL).database or "").endswith("_test"):
    raise RuntimeError("Refusing to run: the TEST_DATABASE_URL database name must end in '_test'.")
os.environ["DATABASE_URL"] = TEST_URL

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

TABLES = "order_items, inventory_movements, orders, products"


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    # Build the schema with the real migrations, so the tests also prove they apply.
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def make_product(client):
    def _make(**overrides):
        body = {"name": "Wireless Mouse", "sku": "wm-1001", "category": "Electronics",
                "unit_price": "899.00", "quantity_on_hand": 42, "reorder_threshold": 15} | overrides
        response = client.post("/api/products", json=body)
        assert response.status_code == 201, response.text
        return response.json()
    return _make
