from datetime import date, datetime
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


# ---------- Dashboard and reports ----------
class ChartDay(BaseModel):
    day: date
    units_in: int
    units_out: int


class RestockItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sku: str
    quantity_on_hand: int
    reorder_threshold: int
    is_active: bool


class RecentOrder(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    customer_name: str
    subtotal: Decimal
    status: str
    created_at: datetime


class DashboardOut(BaseModel):
    product_count: int
    total_units: int
    inventory_value: Decimal
    low_stock_count: int
    out_of_stock_count: int
    pending_orders: int
    movement_chart: list[ChartDay]
    needs_restock: list[RestockItem]
    recent_orders: list[RecentOrder]
    recent_movements: list[MovementOut]


class CategoryValue(BaseModel):
    category: str
    value: Decimal
    units: int


class StatusCount(BaseModel):
    status: str
    count: int
    value: Decimal


class ReportOut(BaseModel):
    date_from: date | None
    date_to: date | None
    timezone: str
    inventory_value: Decimal
    inventory_by_category: list[CategoryValue]
    orders_by_status: list[StatusCount]
    order_count: int
    order_value: Decimal
    units_in: int
    units_out: int
    movement_count: int
    movements: list[MovementOut]
    needs_restock: list[RestockItem]
