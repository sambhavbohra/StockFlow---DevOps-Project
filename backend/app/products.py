from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import exists, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import get_db
from .models import InventoryMovement, OrderItem, Product
from .schemas import ProductCreate, ProductOut, ProductUpdate

router = APIRouter(prefix="/api/products", tags=["products"])
Db = Annotated[Session, Depends(get_db)]

DUPLICATE_SKU = "A product with this SKU already exists."


def get_or_404(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found.")
    return product


def commit_or_409(db: Session, message: str) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, message) from None


@router.get("", response_model=list[ProductOut])
def list_products(
    db: Db,
    search: Annotated[str | None, Query(max_length=120)] = None,
    category: Annotated[str | None, Query(max_length=60)] = None,
    stock_status: Literal["in_stock", "low", "out"] | None = None,
    include_archived: bool = False,
):
    query = select(Product).order_by(Product.name)
    if not include_archived:
        query = query.where(Product.is_active)
    if search and search.strip():
        term = search.strip()
        query = query.where(or_(Product.name.icontains(term, autoescape=True), Product.sku.icontains(term, autoescape=True)))
    if category:
        query = query.where(Product.category == category)
    # Low stock: 0 < quantity <= threshold. Out of stock: quantity == 0 (docs/01-prd.md F1).
    if stock_status == "out":
        query = query.where(Product.quantity_on_hand == 0)
    elif stock_status == "low":
        query = query.where(Product.quantity_on_hand > 0, Product.quantity_on_hand <= Product.reorder_threshold)
    elif stock_status == "in_stock":
        query = query.where(Product.quantity_on_hand > Product.reorder_threshold)
    return db.scalars(query).all()


@router.post("", response_model=ProductOut, status_code=201)
def create_product(payload: ProductCreate, db: Db):
    product = Product(**payload.model_dump())
    db.add(product)
    commit_or_409(db, DUPLICATE_SKU)
    db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Db):
    return get_or_404(db, product_id)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Db):
    product = get_or_404(db, product_id)
    for field, value in payload.model_dump().items():
        setattr(product, field, value)
    commit_or_409(db, DUPLICATE_SKU)
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: int, db: Db):
    product = get_or_404(db, product_id)
    has_history = db.scalar(select(
        exists().where(InventoryMovement.product_id == product_id)
        | exists().where(OrderItem.product_id == product_id)
    ))
    if has_history:
        raise HTTPException(409, "This product has stock movements or orders, so it can't be deleted. Archive it instead.")
    db.delete(product)
    # The foreign keys (ON DELETE RESTRICT) still protect against a race with a new movement.
    commit_or_409(db, "This product has history and can't be deleted. Archive it instead.")
    return Response(status_code=204)
