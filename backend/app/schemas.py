from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

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
