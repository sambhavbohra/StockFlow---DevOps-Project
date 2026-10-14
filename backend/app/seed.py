"""Load deterministic DEMO data:  python -m app.seed

Only runs on an empty catalogue, so it never overwrites real data. It goes through the same
functions as the API, so stock movements and order rules are applied exactly as in normal use.
"""
from decimal import Decimal

from sqlalchemy import func, select

from .database import SessionLocal
from .inventory import apply_movement, lock_products
from .models import Product
from .orders import change_status, create_order
from .schemas import OrderCreate, StatusChange

DEMO_NOTE = "Demo product (seed data)"

PRODUCTS = [  # name, sku, category, price, opening qty, reorder threshold
    ("Wireless Mouse", "WM-1001", "Electronics", "899.00", 40, 15),
    ("Mechanical Keyboard", "MK-2040", "Electronics", "4499.00", 12, 10),
    ("USB-C Hub 7-in-1", "UCH-0707", "Electronics", "2299.00", 4, 12),
    ("A4 Copier Paper (500)", "OS-A4-500", "Office Supplies", "349.00", 20, 40),
    ("Gel Pen Pack (10)", "OS-GP-10", "Office Supplies", "180.00", 25, 30),
    ("Laptop Stand", "AC-LS-01", "Accessories", "1499.00", 8, 10),
    ("Desk Organizer", "AC-DO-02", "Accessories", "699.00", 8, 8),
    ("Ergonomic Chair", "FN-EC-100", "Furniture", "12999.00", 6, 3),
    ("Standing Desk", "FN-SD-200", "Furniture", "24999.00", 2, 2),
]

ADJUSTMENTS = [  # sku, type, qty, reason
    ("OS-A4-500", "IN", 100, "Restock"),
    ("AC-LS-01", "IN", 10, "Restock"),
    ("MK-2040", "OUT", 1, "Damaged"),
]

ORDERS = [  # customer, [(sku, qty)], status path
    ("Ananya Sen", [("WM-1001", 2)], ["CONFIRMED", "SHIPPED", "DELIVERED"]),
    ("TechNexus Corp", [("UCH-0707", 4)], ["CONFIRMED", "SHIPPED"]),
    ("Rajesh Mehta", [("AC-DO-02", 3)], ["CONFIRMED"]),
    ("Devika Pillai", [("AC-LS-01", 1), ("OS-GP-10", 5)], []),
    ("Arjun Nair", [("FN-EC-100", 2)], []),
    ("Meera Krishnan", [("OS-A4-500", 10)], ["CONFIRMED", "CANCELLED"]),
]


def seed() -> bool:
    with SessionLocal() as db:
        if db.scalar(select(func.count(Product.id))):
            print("Products already exist; seed skipped so no data is overwritten.")
            return False

        for name, sku, category, price, qty, threshold in PRODUCTS:
            db.add(Product(name=name, sku=sku, category=category, unit_price=Decimal(price),
                           quantity_on_hand=qty, reorder_threshold=threshold, description=DEMO_NOTE))
        db.commit()
        ids = {p.sku: p.id for p in db.scalars(select(Product))}

        for sku, movement_type, qty, reason in ADJUSTMENTS:
            product = lock_products(db, [ids[sku]])[ids[sku]]
            apply_movement(db, product, movement_type, qty, reason, notes="Demo seed")
            db.commit()

        for customer, lines, path in ORDERS:
            order = create_order(OrderCreate(customer_name=customer, items=[
                {"product_id": ids[sku], "quantity": q} for sku, q in lines]), db)
            for status in path:
                change_status(order.id, StatusChange(status=status), db)
        print(f"Seeded {len(PRODUCTS)} demo products, {len(ADJUSTMENTS)} adjustments and {len(ORDERS)} orders.")
        return True


if __name__ == "__main__":
    seed()
