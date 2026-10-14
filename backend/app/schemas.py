from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Sku = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=64)]
Category = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
Count = Annotated[int, Field(ge=0)]


class ProductBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    sku: Sku
    category: Category = "General"
    description: str | None = None
    unit_price: Money
    reorder_threshold: Count = 10


class ProductCreate(ProductBase):
    # Opening balance. Later changes go through inventory adjustments so they are recorded.
    quantity_on_hand: Count = 0


class ProductUpdate(ProductBase):
    # Full replacement of editable fields. Quantity is deliberately absent.
    is_active: bool = True


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sku: str
    category: str
    description: str | None
    unit_price: Decimal
    quantity_on_hand: int
    reorder_threshold: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------- Inventory ----------
Quantity = Annotated[int, Field(gt=0, le=1_000_000)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class AdjustmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int
    movement_type: Literal["IN", "OUT"]
    quantity: Quantity
    reason: Reason
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_name: str
    product_sku: str
    movement_type: str
    quantity: int
    reason: str
    notes: str | None
    quantity_before: int
    quantity_after: int
    reference_type: str
    reference_id: int | None
    created_at: datetime


# ---------- Orders ----------
OrderStatus = Literal["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"]


class OrderLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int
    quantity: Quantity


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_name: Name
    items: Annotated[list[OrderLineIn], Field(min_length=1, max_length=50)]

    @field_validator("items")
    @classmethod
    def unique_products(cls, items):
        if len({i.product_id for i in items}) != len(items):
            raise ValueError("Each product can appear only once in an order.")
        return items


class StatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: OrderStatus


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int
    product_name_snapshot: str
    sku_snapshot: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    customer_name: str
    status: str
    subtotal: Decimal
    currency: str
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime | None
    cancelled_at: datetime | None
    items: list[OrderItemOut]
