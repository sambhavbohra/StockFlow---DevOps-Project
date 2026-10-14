import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text

from . import inventory, orders, products, reports, settings
from .database import engine

log = logging.getLogger("stockflow")

app = FastAPI(title="StockFlow API", version="0.1.0")
Instrumentator().instrument(app).expose(app, include_in_schema=False)
app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(orders.router)
app.include_router(reports.router)
app.include_router(settings.router)


@app.get("/health", tags=["ops"])
def health():
    """Liveness: the process is up. No database call, so a DB outage doesn't restart pods."""
    return {"status": "ok"}


@app.get("/ready", tags=["ops"])
def ready():
    """Readiness: can we serve traffic, i.e. reach the database?"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        log.exception("Readiness check failed")
        return JSONResponse(status_code=503, content={"status": "unavailable", "detail": "Database is not reachable"})
    return {"status": "ready"}
