// Shared display helpers. Business rules live in the backend; these only format and label.
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export const formatINR = (n) => inr.format(Number(n)); // API money values are decimal strings
export const formatDate = (iso) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const formatDay = (isoDate) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

// Same definitions as the API filters (docs/01-prd.md F1).
export const stockStatus = (p) =>
  p.quantity_on_hand === 0 ? "out" : p.quantity_on_hand <= p.reorder_threshold ? "low" : "in";

// Which buttons to show; the API enforces the same table (docs/05-backend-schema.md §4).
export const NEXT_STATUS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
