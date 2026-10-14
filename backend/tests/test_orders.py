import threading

import pytest
from sqlalchemy import select

from app.models import Product


def qty(client, product_id):
    return client.get(f"/api/products/{product_id}").json()["quantity_on_hand"]


def set_status(client, order_id, status):
    return client.put(f"/api/orders/{order_id}/status", json={"status": status})


@pytest.fixture
def make_order(client):
    def _make(lines, customer="Ananya Sen"):
        response = client.post("/api/orders", json={
            "customer_name": customer,
            "items": [{"product_id": p["id"], "quantity": q} for p, q in lines],
        })
        assert response.status_code == 201, response.text
        return response.json()
    return _make


def test_create_order_snapshots_prices_and_leaves_stock_alone(client, make_product, make_order):
    mouse = make_product(sku="WM-1", unit_price="899.00", quantity_on_hand=10)
    pen = make_product(sku="GP-1", name="Gel Pens", unit_price="180.50", quantity_on_hand=50)
    order = make_order([(mouse, 2), (pen, 3)])

    assert order["order_number"] == "ORD-0001"
    assert order["status"] == "PENDING"
    assert order["subtotal"] == "2339.50"  # 2 x 899.00 + 3 x 180.50, calculated by the server
    assert [i["line_total"] for i in order["items"]] == ["1798.00", "541.50"]
    assert order["items"][0]["product_name_snapshot"] == "Wireless Mouse"
    assert qty(client, mouse["id"]) == 10  # Pending orders don't deduct stock


def test_client_cannot_send_prices_or_totals(client, make_product):
    product = make_product()
    response = client.post("/api/orders", json={
        "customer_name": "X", "items": [{"product_id": product["id"], "quantity": 1, "unit_price": 1}],
    })
    assert response.status_code == 422


def test_invalid_orders_are_rejected(client, make_product):
    product = make_product()
    line = {"product_id": product["id"], "quantity": 1}
    assert client.post("/api/orders", json={"customer_name": "X", "items": []}).status_code == 422
    assert client.post("/api/orders", json={"customer_name": " ", "items": [line]}).status_code == 422
    assert client.post("/api/orders", json={"customer_name": "X", "items": [line, line]}).status_code == 422
    assert client.post("/api/orders", json={"customer_name": "X", "items": [{**line, "quantity": 0}]}).status_code == 422
    assert client.post("/api/orders", json={"customer_name": "X", "items": [{"product_id": 999, "quantity": 1}]}).status_code == 404


def test_archived_product_cannot_be_ordered(client, make_product):
    product = make_product()
    client.put(f"/api/products/{product['id']}", json={
        "name": product["name"], "sku": product["sku"], "unit_price": product["unit_price"], "is_active": False,
    })
    response = client.post("/api/orders", json={"customer_name": "X", "items": [{"product_id": product["id"], "quantity": 1}]})
    assert response.status_code == 409


def test_confirm_deducts_stock_and_records_movements(client, make_product, make_order):
    product = make_product(quantity_on_hand=10)
    order = make_order([(product, 4)])

    response = set_status(client, order["id"], "CONFIRMED")
    assert response.status_code == 200
    assert response.json()["status"] == "CONFIRMED"
    assert response.json()["confirmed_at"] is not None
    assert qty(client, product["id"]) == 6

    [movement] = client.get("/api/inventory/movements").json()
    assert (movement["movement_type"], movement["quantity"], movement["reference_type"], movement["reference_id"]) == ("OUT", 4, "ORDER", order["id"])
    assert movement["reason"] == "Order ORD-0001 confirmed"


def test_confirm_with_insufficient_stock_changes_nothing(client, make_product, make_order):
    plenty = make_product(sku="P-1", name="Plenty", quantity_on_hand=100)
    scarce = make_product(sku="S-1", name="Scarce", quantity_on_hand=1)
    order = make_order([(plenty, 5), (scarce, 2)])

    response = set_status(client, order["id"], "CONFIRMED")
    assert response.status_code == 409
    assert "Scarce (1 on hand, 2 needed)" in response.json()["detail"]
    # No partial update: the line that had enough stock was not deducted either.
    assert qty(client, plenty["id"]) == 100
    assert qty(client, scarce["id"]) == 1
    assert client.get(f"/api/orders/{order['id']}").json()["status"] == "PENDING"
    assert client.get("/api/inventory/movements").json() == []


def test_confirming_twice_deducts_once(client, make_product, make_order):
    product = make_product(quantity_on_hand=10)
    order = make_order([(product, 4)])
    assert set_status(client, order["id"], "CONFIRMED").status_code == 200
    assert set_status(client, order["id"], "CONFIRMED").status_code == 409
    assert qty(client, product["id"]) == 6


def test_cancel_confirmed_order_restores_stock_exactly_once(client, make_product, make_order):
    product = make_product(quantity_on_hand=10)
    order = make_order([(product, 4)])
    set_status(client, order["id"], "CONFIRMED")

    response = set_status(client, order["id"], "CANCELLED")
    assert response.status_code == 200
    assert response.json()["cancelled_at"] is not None
    assert qty(client, product["id"]) == 10
    assert set_status(client, order["id"], "CANCELLED").status_code == 409
    assert qty(client, product["id"]) == 10

    reasons = [m["reason"] for m in client.get("/api/inventory/movements").json()]
    assert reasons == ["Order ORD-0001 cancelled", "Order ORD-0001 confirmed"]


def test_cancel_pending_order_does_not_touch_stock(client, make_product, make_order):
    product = make_product(quantity_on_hand=10)
    order = make_order([(product, 4)])
    assert set_status(client, order["id"], "CANCELLED").status_code == 200
    assert qty(client, product["id"]) == 10
    assert client.get("/api/inventory/movements").json() == []


def test_fulfilment_path_and_invalid_transitions(client, make_product, make_order):
    product = make_product(quantity_on_hand=10)
    order = make_order([(product, 1)])
    assert set_status(client, order["id"], "SHIPPED").status_code == 409      # must be confirmed first
    assert set_status(client, order["id"], "CONFIRMED").status_code == 200
    assert set_status(client, order["id"], "DELIVERED").status_code == 409    # must ship first
    assert set_status(client, order["id"], "SHIPPED").status_code == 200
    assert set_status(client, order["id"], "CANCELLED").status_code == 409    # no returns in v1
    assert set_status(client, order["id"], "DELIVERED").status_code == 200
    assert set_status(client, order["id"], "PENDING").status_code == 409      # final
    assert set_status(client, order["id"], "BOGUS").status_code == 422
    assert set_status(client, 999, "CONFIRMED").status_code == 404
    assert qty(client, product["id"]) == 9


def test_list_orders_filters_by_status_and_search(client, make_product, make_order):
    product = make_product(quantity_on_hand=10)
    first = make_order([(product, 1)], customer="Ananya Sen")
    make_order([(product, 1)], customer="Rajesh Mehta")
    set_status(client, first["id"], "CONFIRMED")

    numbers = lambda params: [o["order_number"] for o in client.get("/api/orders", params=params).json()]  # noqa: E731
    assert numbers({}) == ["ORD-0002", "ORD-0001"]
    assert numbers({"status": "CONFIRMED"}) == ["ORD-0001"]
    assert numbers({"search": "rajesh"}) == ["ORD-0002"]
    assert numbers({"search": "ord-0001"}) == ["ORD-0001"]


def test_confirm_waits_for_a_concurrent_stock_change(client, db, make_product, make_order):
    """Deterministic concurrency check: without row locks the confirm would read stale stock and oversell."""
    product = make_product(quantity_on_hand=5)
    order = make_order([(product, 3)])

    # Another transaction holds the product row, as a simultaneous adjustment would.
    locked = db.execute(select(Product).where(Product.id == product["id"]).with_for_update()).scalar_one()
    result = {}
    worker = threading.Thread(target=lambda: result.update(code=set_status(client, order["id"], "CONFIRMED").status_code))
    worker.start()
    worker.join(timeout=0.5)
    assert worker.is_alive(), "confirm did not wait for the product row lock"

    locked.quantity_on_hand = 1  # the other transaction takes most of the stock
    db.commit()
    worker.join(timeout=5)

    assert result["code"] == 409
    assert qty(client, product["id"]) == 1
