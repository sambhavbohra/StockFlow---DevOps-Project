// Demo data for Phase 1 (UI only). Replaced by the FastAPI backend from Phase 3.
// ponytail: in-memory store, resets on reload; API hooks replace it in Phases 3–5.
import { createContext, useContext, useState, createElement } from "react";

const products = [
  { id: 1, name: "Wireless Mouse", sku: "WM-1001", category: "Electronics", unit_price: 899, quantity_on_hand: 42, reorder_threshold: 15, is_active: true },
  { id: 2, name: "Mechanical Keyboard", sku: "MK-2040", category: "Electronics", unit_price: 4499, quantity_on_hand: 8, reorder_threshold: 10, is_active: true },
  { id: 3, name: "USB-C Hub 7-in-1", sku: "UCH-0707", category: "Electronics", unit_price: 2299, quantity_on_hand: 0, reorder_threshold: 12, is_active: true },
  { id: 4, name: "A4 Copier Paper (500)", sku: "OS-A4-500", category: "Office Supplies", unit_price: 349, quantity_on_hand: 120, reorder_threshold: 40, is_active: true },
  { id: 5, name: "Gel Pen Pack (10)", sku: "OS-GP-10", category: "Office Supplies", unit_price: 180, quantity_on_hand: 25, reorder_threshold: 30, is_active: true },
  { id: 6, name: "Laptop Stand", sku: "AC-LS-01", category: "Accessories", unit_price: 1499, quantity_on_hand: 18, reorder_threshold: 10, is_active: true },
  { id: 7, name: "Desk Organizer", sku: "AC-DO-02", category: "Accessories", unit_price: 699, quantity_on_hand: 5, reorder_threshold: 8, is_active: true },
  { id: 8, name: "Ergonomic Chair", sku: "FN-EC-100", category: "Furniture", unit_price: 12999, quantity_on_hand: 6, reorder_threshold: 3, is_active: true },
  { id: 9, name: "Standing Desk", sku: "FN-SD-200", category: "Furniture", unit_price: 24999, quantity_on_hand: 2, reorder_threshold: 2, is_active: true },
  { id: 10, name: "HDMI Cable 2m", sku: "EL-HD-2M", category: "Electronics", unit_price: 399, quantity_on_hand: 60, reorder_threshold: 20, is_active: false },
];

const movements = [
  { id: 1, product_id: 4, movement_type: "IN", quantity: 100, reason: "Restock", quantity_before: 20, quantity_after: 120, reference_type: "MANUAL", created_at: "2026-10-08T10:15:00Z" },
  { id: 2, product_id: 1, movement_type: "IN", quantity: 30, reason: "Restock", quantity_before: 14, quantity_after: 44, reference_type: "MANUAL", created_at: "2026-10-09T09:40:00Z" },
  { id: 3, product_id: 1, movement_type: "OUT", quantity: 2, reason: "Order ORD-0001 confirmed", quantity_before: 44, quantity_after: 42, reference_type: "ORDER", created_at: "2026-10-10T11:05:00Z" },
  { id: 4, product_id: 3, movement_type: "OUT", quantity: 4, reason: "Order ORD-0002 confirmed", quantity_before: 4, quantity_after: 0, reference_type: "ORDER", created_at: "2026-10-11T14:20:00Z" },
  { id: 5, product_id: 2, movement_type: "OUT", quantity: 3, reason: "Damaged", quantity_before: 11, quantity_after: 8, reference_type: "MANUAL", created_at: "2026-10-12T08:30:00Z" },
  { id: 6, product_id: 6, movement_type: "IN", quantity: 10, reason: "Restock", quantity_before: 8, quantity_after: 18, reference_type: "MANUAL", created_at: "2026-10-13T16:45:00Z" },
  { id: 7, product_id: 7, movement_type: "OUT", quantity: 3, reason: "Order ORD-0003 confirmed", quantity_before: 8, quantity_after: 5, reference_type: "ORDER", created_at: "2026-10-14T09:10:00Z" },
];

const orders = [
  { id: 1, order_number: "ORD-0001", customer_name: "Ananya Sen", status: "DELIVERED", created_at: "2026-10-09T12:00:00Z", items: [{ product_id: 1, product_name_snapshot: "Wireless Mouse", sku_snapshot: "WM-1001", quantity: 2, unit_price: 899 }] },
  { id: 2, order_number: "ORD-0002", customer_name: "TechNexus Corp", status: "SHIPPED", created_at: "2026-10-11T10:00:00Z", items: [{ product_id: 3, product_name_snapshot: "USB-C Hub 7-in-1", sku_snapshot: "UCH-0707", quantity: 4, unit_price: 2299 }] },
  { id: 3, order_number: "ORD-0003", customer_name: "Rajesh Mehta", status: "CONFIRMED", created_at: "2026-10-13T15:30:00Z", items: [{ product_id: 7, product_name_snapshot: "Desk Organizer", sku_snapshot: "AC-DO-02", quantity: 3, unit_price: 699 }] },
  { id: 4, order_number: "ORD-0004", customer_name: "Devika Pillai", status: "PENDING", created_at: "2026-10-14T08:15:00Z", items: [{ product_id: 6, product_name_snapshot: "Laptop Stand", sku_snapshot: "AC-LS-01", quantity: 1, unit_price: 1499 }, { product_id: 5, product_name_snapshot: "Gel Pen Pack (10)", sku_snapshot: "OS-GP-10", quantity: 5, unit_price: 180 }] },
  { id: 5, order_number: "ORD-0005", customer_name: "Arjun Nair", status: "PENDING", created_at: "2026-10-14T10:45:00Z", items: [{ product_id: 8, product_name_snapshot: "Ergonomic Chair", sku_snapshot: "FN-EC-100", quantity: 2, unit_price: 12999 }] },
  { id: 6, order_number: "ORD-0006", customer_name: "Meera Krishnan", status: "CANCELLED", created_at: "2026-10-12T13:00:00Z", items: [{ product_id: 4, product_name_snapshot: "A4 Copier Paper (500)", sku_snapshot: "OS-A4-500", quantity: 10, unit_price: 349 }] },
];

// Mirrors docs/05-backend-schema.md §4; the backend enforces it from Phase 4.
export const NEXT_STATUS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
export const formatINR = (n) => inr.format(n);
export const formatDate = (iso) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const stockStatus = (p) =>
  p.quantity_on_hand === 0 ? "out" : p.quantity_on_hand <= p.reorder_threshold ? "low" : "in";
export const orderTotal = (o) => o.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

const StoreContext = createContext(null);

export function DemoStoreProvider({ children }) {
  const [state, setState] = useState({ products, movements, orders, settings: { business_name: "StockFlow Demo Store" } });
  const update = (key, fn) => setState((s) => ({ ...s, [key]: fn(s[key]) }));
  return createElement(StoreContext.Provider, { value: { ...state, update } }, children);
}

export const useStore = () => useContext(StoreContext);
