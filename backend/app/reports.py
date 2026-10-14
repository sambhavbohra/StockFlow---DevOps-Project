"""Dashboard and report aggregates, always calculated from persisted rows (PRD FR-07)."""
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from .database import get_db
from .inventory import REPORT_TZ, local_day, to_out
from .models import ORDER_STATUSES, InventoryMovement, Order, Product
from .schemas import DashboardOut, ReportOut

router = APIRouter(prefix="/api", tags=["reports"])
Db = Annotated[Session, Depends(get_db)]

VALUE = func.coalesce(func.sum(Product.quantity_on_hand * Product.unit_price), 0)
UNITS = func.coalesce(func.sum(Product.quantity_on_hand), 0)
IS_OUT = Product.quantity_on_hand == 0
IS_LOW = (Product.quantity_on_hand > 0) & (Product.quantity_on_hand <= Product.reorder_threshold)


def today() -> date:
    return datetime.now(ZoneInfo(REPORT_TZ)).date()


def money(value) -> Decimal:
    """Always two decimals, so the API returns "0.00" rather than "0", matching product prices."""
    return Decimal(value).quantize(Decimal("0.01"))


def needs_restock(db: Session, limit: int | None = None):
    return db.scalars(select(Product).where(Product.is_active, IS_OUT | IS_LOW)
                      .order_by(Product.quantity_on_hand, Product.name).limit(limit)).all()


def latest_movements(db: Session, *conditions, limit: int):
    return [to_out(m) for m in db.scalars(
        select(InventoryMovement).options(selectinload(InventoryMovement.product)).where(*conditions)
        .order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc()).limit(limit))]


@router.get("/dashboard/summary", response_model=DashboardOut)
def dashboard_summary(db: Db):
    count, units, value, low, out = db.execute(select(
        func.count(Product.id), UNITS, VALUE, func.count(Product.id).filter(IS_LOW), func.count(Product.id).filter(IS_OUT),
    ).where(Product.is_active)).one()

    # Units in/out per day for the last 7 days in the business timezone, including empty days.
    start = today() - timedelta(days=6)
    day = local_day(InventoryMovement.created_at)
    per_day = {(d, t): int(q) for d, t, q in db.execute(
        select(day, InventoryMovement.movement_type, func.sum(InventoryMovement.quantity))
        .where(day >= start).group_by(day, InventoryMovement.movement_type))}
    chart = [{"day": d, "units_in": per_day.get((d, "IN"), 0), "units_out": per_day.get((d, "OUT"), 0)}
             for d in (start + timedelta(days=i) for i in range(7))]

    return {
        "product_count": count,
        "total_units": int(units),
        "inventory_value": money(value),
        "low_stock_count": low,
        "out_of_stock_count": out,
        "pending_orders": db.scalar(select(func.count(Order.id)).where(Order.status == "PENDING")),
        "movement_chart": chart,
        "needs_restock": needs_restock(db, limit=8),
        "recent_orders": db.scalars(select(Order).order_by(Order.created_at.desc(), Order.id.desc()).limit(5)).all(),
        "recent_movements": latest_movements(db, limit=5),
    }


@router.get("/reports/summary", response_model=ReportOut)
def reports_summary(db: Db, date_from: date | None = None, date_to: date | None = None):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to.")

    def in_range(column):
        day = local_day(column)
        return ([day >= date_from] if date_from else []) + ([day <= date_to] if date_to else [])

    # Inventory value is always "now"; the date range applies to orders and movements.
    categories = [{"category": c, "value": money(v), "units": int(u)} for c, v, u in db.execute(
        select(Product.category, VALUE, UNITS).where(Product.is_active)
        .group_by(Product.category).order_by(VALUE.desc(), Product.category))]

    found = {s: (c, v) for s, c, v in db.execute(
        select(Order.status, func.count(Order.id), func.coalesce(func.sum(Order.subtotal), 0))
        .where(*in_range(Order.created_at)).group_by(Order.status))}
    statuses = [{"status": s, "count": found.get(s, (0, 0))[0], "value": money(found.get(s, (0, 0))[1])}
                for s in ORDER_STATUSES]

    moves = in_range(InventoryMovement.created_at)
    units_in, units_out, movement_count = db.execute(select(
        func.coalesce(func.sum(case((InventoryMovement.movement_type == "IN", InventoryMovement.quantity))), 0),
        func.coalesce(func.sum(case((InventoryMovement.movement_type == "OUT", InventoryMovement.quantity))), 0),
        func.count(InventoryMovement.id),
    ).where(*moves)).one()

    return {
        "date_from": date_from,
        "date_to": date_to,
        "timezone": REPORT_TZ,
        "inventory_value": money(sum((c["value"] for c in categories), Decimal(0))),
        "inventory_by_category": categories,
        "orders_by_status": statuses,
        "order_count": sum(s["count"] for s in statuses),
        "order_value": money(sum((s["value"] for s in statuses if s["status"] != "CANCELLED"), Decimal(0))),  # cancelled isn't revenue
        "units_in": int(units_in),
        "units_out": int(units_out),
        "movement_count": movement_count,
        "movements": latest_movements(db, *moves, limit=20),
        "needs_restock": needs_restock(db),
    }
