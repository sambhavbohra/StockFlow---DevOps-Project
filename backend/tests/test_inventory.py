def adjust(client, product_id, movement_type, quantity, reason="Restock", **extra):
    return client.post("/api/inventory/adjustments", json={
        "product_id": product_id, "movement_type": movement_type, "quantity": quantity, "reason": reason, **extra,
    })


def qty(client, product_id):
    return client.get(f"/api/products/{product_id}").json()["quantity_on_hand"]


def test_stock_in_updates_quantity_and_records_movement(client, make_product):
    product = make_product(quantity_on_hand=10)
    response = adjust(client, product["id"], "IN", 5, notes="PO-123")
    assert response.status_code == 201
    body = response.json()
    assert (body["quantity_before"], body["quantity_after"]) == (10, 15)
    assert body["product_name"] == "Wireless Mouse"
    assert body["reference_type"] == "MANUAL"
    assert body["notes"] == "PO-123"
    assert qty(client, product["id"]) == 15


def test_stock_out_cannot_go_below_zero(client, make_product):
    product = make_product(quantity_on_hand=3)
    response = adjust(client, product["id"], "OUT", 4, reason="Damaged")
    assert response.status_code == 409
    assert "3 on hand" in response.json()["detail"]
    # Nothing was written: same quantity, no movement.
    assert qty(client, product["id"]) == 3
    assert client.get("/api/inventory/movements").json() == []


def test_stock_out_to_exactly_zero_is_allowed(client, make_product):
    product = make_product(quantity_on_hand=3)
    assert adjust(client, product["id"], "OUT", 3, reason="Damaged").status_code == 201
    assert qty(client, product["id"]) == 0


def test_invalid_adjustments_are_rejected(client, make_product):
    product = make_product()
    assert adjust(client, product["id"], "IN", 0).status_code == 422
    assert adjust(client, product["id"], "IN", -2).status_code == 422
    assert adjust(client, product["id"], "IN", 1.5).status_code == 422
    assert adjust(client, product["id"], "SIDEWAYS", 1).status_code == 422
    assert adjust(client, product["id"], "IN", 1, reason="  ").status_code == 422
    assert adjust(client, 9999, "IN", 1).status_code == 404


def test_archived_product_cannot_be_adjusted(client, make_product):
    product = make_product()
    client.put(f"/api/products/{product['id']}", json={
        "name": product["name"], "sku": product["sku"], "unit_price": product["unit_price"], "is_active": False,
    })
    assert adjust(client, product["id"], "IN", 1).status_code == 409


def test_movements_list_newest_first_and_filters_by_product(client, make_product):
    a = make_product(sku="A-1", name="Alpha")
    b = make_product(sku="B-1", name="Beta")
    adjust(client, a["id"], "IN", 1)
    adjust(client, b["id"], "IN", 2)
    adjust(client, a["id"], "OUT", 1, reason="Damaged")

    all_moves = client.get("/api/inventory/movements").json()
    assert [(m["product_name"], m["movement_type"]) for m in all_moves] == [("Alpha", "OUT"), ("Beta", "IN"), ("Alpha", "IN")]
    only_a = client.get("/api/inventory/movements", params={"product_id": a["id"]}).json()
    assert {m["product_id"] for m in only_a} == {a["id"]}
    assert len(only_a) == 2
