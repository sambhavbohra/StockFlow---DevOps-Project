from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .database import get_db
from .models import InventoryMovement, Product
from .schemas import AdjustmentCreate, MovementOut

router = APIRouter(prefix="/api/inventory", tags=["inventory"])
Db = Annotated[Session, Depends(get_db)]

# ponytail: one business timezone (the app is INR/India-only in v1); make it a setting if that changes.
REPORT_TZ = "Asia/Kolkata"


def local_day(column):
    """Calendar day of a timestamptz column in the business timezone."""
    return func.date(func.timezone(REPORT_TZ, column))


def lock_products(db: Session, product_ids) -> dict[int, Product]:
    """Lock product rows for the rest of the transaction, in id order to avoid deadlocks."""
    rows = db.scalars(
        select(Product).where(Product.id.in_(product_ids)).order_by(Product.id).with_for_update()
    ).all()
    return {p.id: p for p in rows}


def apply_movement(db: Session, product: Product, movement_type: str, quantity: int, reason: str,
                   reference_type: str = "MANUAL", reference_id: int | None = None, notes: str | None = None):
    """The only place stock changes. Caller must hold the product row lock and commit."""
    before = product.quantity_on_hand
    after = before + quantity if movement_type == "IN" else before - quantity
    if after < 0:
        raise HTTPException(409, f"Not enough stock for {product.name}: {before} on hand, {quantity} requested.")
    product.quantity_on_hand = after
    movement = InventoryMovement(
        product=product, movement_type=movement_type, quantity=quantity, reason=reason, notes=notes,
        quantity_before=before, quantity_after=after, reference_type=reference_type, reference_id=reference_id,
    )
    db.add(movement)
    return movement


def to_out(m: InventoryMovement) -> MovementOut:
    return MovementOut.model_validate({**m.__dict__, "product_name": m.product.name, "product_sku": m.product.sku})


@router.get("/movements", response_model=list[MovementOut])
def list_movements(
    db: Db,
    product_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    query = (select(InventoryMovement).options(selectinload(InventoryMovement.product))
             .order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc()).limit(limit))
    if product_id is not None:
        query = query.where(InventoryMovement.product_id == product_id)
    day = local_day(InventoryMovement.created_at)  # same calendar days as the reports
    if date_from:
        query = query.where(day >= date_from)
    if date_to:
        query = query.where(day <= date_to)
    return [to_out(m) for m in db.scalars(query)]


@router.post("/adjustments", response_model=MovementOut, status_code=201)
def create_adjustment(payload: AdjustmentCreate, db: Db):
    product = lock_products(db, [payload.product_id]).get(payload.product_id)
    if product is None:
        raise HTTPException(404, "Product not found.")
    if not product.is_active:
        raise HTTPException(409, f"{product.name} is archived. Restore it before adjusting stock.")
    movement = apply_movement(db, product, payload.movement_type, payload.quantity, payload.reason, notes=payload.notes)
    db.commit()
    db.refresh(movement)
    return to_out(movement)
