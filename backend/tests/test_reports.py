from datetime import timedelta

from app.reports import today
from app.seed import seed


def adjust(client, product_id, movement_type, quantity, reason="Restock"):
    r = client.post("/api/inventory/adjustments", json={"product_id": product_id, "movement_type": movement_type, "quantity": quantity, "reason": reason})
    assert r.status_code == 201, r.text


def order(client, customer, lines, *statuses):
    r = client.post("/api/orders", json={"customer_name": customer, "items": [{"product_id": p["id"], "quantity": q} for p, q in lines]})
    assert r.status_code == 201, r.text
    for s in statuses:
        assert client.put(f"/api/orders/{r.json()['id']}/status", json={"status": s}).status_code == 200
    return r.json()


def test_dashboard_numbers_match_the_data(client, make_product):
    mouse = make_product(sku="WM-1", name="Mouse", unit_price="100.00", quantity_on_hand=20, reorder_threshold=5)
    pen = make_product(sku="GP-1", name="Pens", unit_price="10.50", quantity_on_hand=4, reorder_threshold=5)     # low
    make_product(sku="HB-1", name="Hub", unit_price="50.00", quantity_on_hand=0)                                 # out
    archived = make_product(sku="AR-1", name="Old", unit_price="999.00", quantity_on_hand=99)
    client.put(f"/api/products/{archived['id']}", json={"name": "Old", "sku": "AR-1", "unit_price": "999.00", "is_active": False})

    adjust(client, mouse["id"], "IN", 10)                        # mouse 30
    order(client, "A", [(mouse, 3)], "CONFIRMED")                # mouse 27
    order(client, "B", [(pen, 1)])                               # pending, no stock change

    d = client.get("/api/dashboard/summary").json()
    assert d["product_count"] == 3                               # archived excluded
    assert d["total_units"] == 27 + 4 + 0
    assert d["inventory_value"] == "2742.00"                     # 27 x 100 + 4 x 10.50
    assert (d["low_stock_count"], d["out_of_stock_count"], d["pending_orders"]) == (1, 1, 1)
    assert [p["name"] for p in d["needs_restock"]] == ["Hub", "Pens"]
    assert [o["customer_name"] for o in d["recent_orders"]] == ["B", "A"]
    assert len(d["movement_chart"]) == 7
    assert d["movement_chart"][-1] == {"day": today().isoformat(), "units_in": 10, "units_out": 3}
    assert d["recent_movements"][0]["reason"] == "Order ORD-0001 confirmed"


def test_reports_group_by_category_and_status(client, make_product):
    mouse = make_product(sku="WM-1", category="Electronics", unit_price="100.00", quantity_on_hand=10)
    make_product(sku="OS-1", category="Office", unit_price="5.00", quantity_on_hand=100)
    order(client, "A", [(mouse, 2)], "CONFIRMED")
    order(client, "B", [(mouse, 1)], "CONFIRMED", "CANCELLED")
    order(client, "C", [(mouse, 1)])

    r = client.get("/api/reports/summary").json()
    assert r["inventory_by_category"] == [  # highest value first
        {"category": "Electronics", "value": "800.00", "units": 8},  # 10 - 2 confirmed; B's 1 was returned on cancel
        {"category": "Office", "value": "500.00", "units": 100},
    ]
    assert r["inventory_value"] == "1300.00"
    by_status = {s["status"]: (s["count"], s["value"]) for s in r["orders_by_status"]}
    assert by_status == {"PENDING": (1, "100.00"), "CONFIRMED": (1, "200.00"), "SHIPPED": (0, "0.00"),
                         "DELIVERED": (0, "0.00"), "CANCELLED": (1, "100.00")}
    assert r["order_count"] == 3
    assert r["order_value"] == "300.00"                          # cancelled orders excluded
    assert (r["units_in"], r["units_out"], r["movement_count"]) == (1, 3, 3)


def test_report_date_filter_uses_business_days(client, make_product):
    product = make_product(quantity_on_hand=10)
    adjust(client, product["id"], "IN", 1)
    t = today()

    def count(**params):
        return client.get("/api/reports/summary", params=params).json()["movement_count"]

    assert count(date_from=t.isoformat(), date_to=t.isoformat()) == 1
    assert count(date_from=(t + timedelta(days=1)).isoformat()) == 0
    assert count(date_to=(t - timedelta(days=1)).isoformat()) == 0
    bad = client.get("/api/reports/summary", params={"date_from": t.isoformat(), "date_to": (t - timedelta(days=1)).isoformat()})
    assert bad.status_code == 422


def test_settings_read_update_and_validate(client):
    assert client.get("/api/settings").json()["business_name"] == "StockFlow Demo Store"
    r = client.put("/api/settings", json={"business_name": "  Sammy Traders  "})
    assert r.status_code == 200
    assert r.json()["business_name"] == "Sammy Traders"
    assert r.json()["currency"] == "INR"
    assert client.get("/api/settings").json()["business_name"] == "Sammy Traders"
    assert client.put("/api/settings", json={"business_name": "   "}).status_code == 422
    assert client.put("/api/settings", json={"business_name": "x" * 81}).status_code == 422
    assert client.put("/api/settings", json={"business_name": "X", "currency": "USD"}).status_code == 422


def test_seed_loads_consistent_demo_data_once(client, make_product):
    assert seed() is True
    stock = {p["sku"]: p["quantity_on_hand"] for p in client.get("/api/products").json()}
    assert stock["WM-1001"] == 38       # 40 - 2 delivered
    assert stock["UCH-0707"] == 0       # 4 - 4 shipped
    assert stock["OS-A4-500"] == 120    # 20 + 100 restock; the 10 confirmed were returned on cancel
    assert stock["AC-LS-01"] == 18      # 8 + 10; the pending order deducts nothing
    assert stock["MK-2040"] == 11       # 12 - 1 damaged
    assert {o["status"] for o in client.get("/api/orders").json()} == {"DELIVERED", "SHIPPED", "CONFIRMED", "PENDING", "CANCELLED"}

    assert seed() is False              # never overwrites existing data
    assert len(client.get("/api/products").json()) == 9
