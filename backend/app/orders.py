from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from .database import get_db
from .inventory import apply_movement, lock_products
from .models import Order, OrderItem, Product
from .schemas import OrderCreate, OrderOut, OrderStatus, StatusChange

router = APIRouter(prefix="/api/orders", tags=["orders"])
Db = Annotated[Session, Depends(get_db)]

# docs/05-backend-schema.md §4
NEXT_STATUS = {
    "PENDING": {"CONFIRMED", "CANCELLED"},
    "CONFIRMED": {"SHIPPED", "CANCELLED"},
    "SHIPPED": {"DELIVERED"},
    "DELIVERED": set(),
    "CANCELLED": set(),
}


def load_order(db: Session, order_id: int, lock: bool = False) -> Order:
    # populate_existing: re-read server-set values (order_number, timestamps) after a commit.
    query = (select(Order).where(Order.id == order_id).options(selectinload(Order.items))
             .execution_options(populate_existing=True))
    order = db.scalar(query.with_for_update() if lock else query)
    if order is None:
        raise HTTPException(404, "Order not found.")
    return order


@router.get("", response_model=list[OrderOut])
def list_orders(
    db: Db,
    status: OrderStatus | None = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
):
    query = select(Order).options(selectinload(Order.items)).order_by(Order.created_at.desc(), Order.id.desc())
    if status:
        query = query.where(Order.status == status)
    if search and search.strip():
        term = search.strip()
        query = query.where(or_(Order.order_number.icontains(term, autoescape=True),
                                Order.customer_name.icontains(term, autoescape=True)))
    return db.scalars(query).all()


@router.post("", response_model=OrderOut, status_code=201)
def create_order(payload: OrderCreate, db: Db):
    ids = [line.product_id for line in payload.items]
    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(ids)))}
    for line in payload.items:
        product = products.get(line.product_id)
        if product is None:
            raise HTTPException(404, f"Product {line.product_id} not found.")
        if not product.is_active:
            raise HTTPException(409, f"{product.name} is archived and can't be ordered.")

    # Prices and totals come from the catalogue, never from the client. Stock is untouched until confirmation.
    order = Order(customer_name=payload.customer_name)
    for line in payload.items:
        p = products[line.product_id]
        order.items.append(OrderItem(
            product_id=p.id, product_name_snapshot=p.name, sku_snapshot=p.sku, quantity=line.quantity,
            unit_price=p.unit_price, line_total=p.unit_price * line.quantity,
        ))
    order.subtotal = sum(i.line_total for i in order.items)
    db.add(order)
    db.commit()
    return load_order(db, order.id)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Db):
    return load_order(db, order_id)


@router.put("/{order_id}/status", response_model=OrderOut)
def change_status(order_id: int, payload: StatusChange, db: Db):
    # Locking the order row makes concurrent or repeated requests queue up, so each
    # transition (and its stock change) happens exactly once.
    order = load_order(db, order_id, lock=True)
    target = payload.status
    if target not in NEXT_STATUS[order.status]:
        raise HTTPException(409, f"An order that is {order.status.lower()} can't be changed to {target.lower()}.")

    if target == "CONFIRMED":
        products = lock_products(db, [i.product_id for i in order.items])
        short = [f"{p.name} ({p.quantity_on_hand} on hand, {i.quantity} needed)"
                 for i in order.items if (p := products[i.product_id]).quantity_on_hand < i.quantity]
        if short:
            raise HTTPException(409, "Not enough stock to confirm: " + "; ".join(short) + ".")
        for i in order.items:
            apply_movement(db, products[i.product_id], "OUT", i.quantity,
                           f"Order {order.order_number} confirmed", "ORDER", order.id)
        order.confirmed_at = func.now()
    elif target == "CANCELLED":
        if order.status == "CONFIRMED":
            products = lock_products(db, [i.product_id for i in order.items])
            for i in order.items:
                apply_movement(db, products[i.product_id], "IN", i.quantity,
                               f"Order {order.order_number} cancelled", "ORDER", order.id)
        order.cancelled_at = func.now()

    order.status = target
    db.commit()
    return load_order(db, order.id)
