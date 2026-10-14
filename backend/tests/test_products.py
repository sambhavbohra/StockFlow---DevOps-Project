import pytest

from app.models import InventoryMovement


def test_create_product_normalizes_input(client):
    response = client.post("/api/products", json={
        "name": "  Laptop Stand ", "sku": " ac-ls-01 ", "unit_price": 1499, "quantity_on_hand": 18,
    })
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Laptop Stand"
    assert body["sku"] == "AC-LS-01"
    assert body["category"] == "General"
    assert body["reorder_threshold"] == 10
    assert body["is_active"] is True


def test_duplicate_sku_is_rejected_case_insensitively(client, make_product):
    make_product(sku="WM-1001")
    response = client.post("/api/products", json={"name": "Other", "sku": "wm-1001", "unit_price": 1})
    assert response.status_code == 409
    assert "SKU" in response.json()["detail"]


@pytest.mark.parametrize("bad", [
    {"name": "", "sku": "X-1", "unit_price": 1},
    {"name": "Pen", "sku": "   ", "unit_price": 1},
    {"name": "Pen", "sku": "X-1", "unit_price": -1},
    {"name": "Pen", "sku": "X-1", "unit_price": 1, "quantity_on_hand": -5},
    {"name": "Pen", "sku": "X-1", "unit_price": 1, "reorder_threshold": -1},
    {"name": "Pen", "sku": "X-1", "unit_price": "1.999"},
    {"name": "Pen", "sku": "X-1", "unit_price": 1, "unexpected": True},
])
def test_invalid_product_is_rejected(client, bad):
    assert client.post("/api/products", json=bad).status_code == 422


def test_list_filters_by_search_category_and_stock_status(client, make_product):
    make_product(name="Wireless Mouse", sku="WM-1", category="Electronics", quantity_on_hand=42, reorder_threshold=15)
    make_product(name="Mechanical Keyboard", sku="MK-1", category="Electronics", quantity_on_hand=8, reorder_threshold=10)
    make_product(name="USB-C Hub", sku="UCH-1", category="Electronics", quantity_on_hand=0)
    make_product(name="Copier Paper", sku="OS-1", category="Office Supplies", quantity_on_hand=120)

    names = lambda params: [p["name"] for p in client.get("/api/products", params=params).json()]  # noqa: E731
    assert names({}) == ["Copier Paper", "Mechanical Keyboard", "USB-C Hub", "Wireless Mouse"]
    assert names({"search": "mouse"}) == ["Wireless Mouse"]
    assert names({"search": "os-1"}) == ["Copier Paper"]
    assert names({"category": "Office Supplies"}) == ["Copier Paper"]
    assert names({"stock_status": "low"}) == ["Mechanical Keyboard"]
    assert names({"stock_status": "out"}) == ["USB-C Hub"]
    assert names({"stock_status": "in_stock"}) == ["Copier Paper", "Wireless Mouse"]


def test_get_missing_product_returns_404(client):
    assert client.get("/api/products/999").status_code == 404


def test_update_replaces_fields_and_archives(client, make_product):
    product = make_product()
    update = {"name": "Wireless Mouse v2", "sku": "WM-1001", "category": "Electronics",
              "unit_price": "949.50", "reorder_threshold": 20, "is_active": False}
    response = client.put(f"/api/products/{product['id']}", json=update)
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Wireless Mouse v2"
    assert body["unit_price"] == "949.50"
    assert body["quantity_on_hand"] == 42  # quantity can't be changed through product updates
    assert body["is_active"] is False

    assert client.get("/api/products").json() == []
    assert [p["id"] for p in client.get("/api/products", params={"include_archived": True}).json()] == [product["id"]]


def test_update_to_existing_sku_returns_409(client, make_product):
    make_product(sku="A-1")
    second = make_product(sku="B-1")
    response = client.put(f"/api/products/{second['id']}", json={"name": "B", "sku": "a-1", "unit_price": 1})
    assert response.status_code == 409


def test_delete_product_without_history(client, make_product):
    product = make_product()
    assert client.delete(f"/api/products/{product['id']}").status_code == 204
    assert client.get(f"/api/products/{product['id']}").status_code == 404
    assert client.delete(f"/api/products/{product['id']}").status_code == 404


def test_delete_product_with_history_returns_409(client, db, make_product):
    product = make_product()
    db.add(InventoryMovement(product_id=product["id"], movement_type="IN", quantity=5, reason="Restock",
                             quantity_before=42, quantity_after=47))
    db.commit()

    response = client.delete(f"/api/products/{product['id']}")
    assert response.status_code == 409
    assert "Archive" in response.json()["detail"]
    assert client.get(f"/api/products/{product['id']}").status_code == 200
