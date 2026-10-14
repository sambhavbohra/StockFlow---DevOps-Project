import { useState } from "react";
import { Ban, Check, ClipboardList, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { NEXT_STATUS, formatDate, formatINR, orderTotal, useStore } from "../demoData.js";
import { DemoBanner, Dialog, EmptyState, Field, OrderBadge, PageHeader, orderLabel, useToast } from "../ui.jsx";

const STATUSES = Object.keys(NEXT_STATUS);
const STEPS = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"];
const ACTION = { CONFIRMED: "Confirm order", SHIPPED: "Mark shipped", DELIVERED: "Mark delivered", CANCELLED: "Cancel order" };

function CreateOrderDialog({ onClose, onCreated }) {
  const { products, orders, update } = useStore();
  const toast = useToast();
  const active = products.filter((p) => p.is_active);
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState([{ product_id: String(active[0]?.id ?? ""), quantity: "1" }]);
  const [errors, setErrors] = useState({});
  const setLine = (i, k) => (e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));
  const priced = lines.map((l) => ({ ...l, product: products.find((p) => p.id === Number(l.product_id)) }));
  const estimate = priced.reduce((s, l) => s + (l.product && /^\d+$/.test(l.quantity) ? l.product.unit_price * Number(l.quantity) : 0), 0);

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!customer.trim()) errs.customer = "Customer name is required.";
    priced.forEach((l, i) => { if (!/^\d+$/.test(l.quantity) || Number(l.quantity) <= 0) errs[`q${i}`] = "Whole number above 0."; });
    if (new Set(lines.map((l) => l.product_id)).size !== lines.length) errs.lines = "Each product can appear only once.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const id = Math.max(0, ...orders.map((o) => o.id)) + 1;
    const order = {
      id, order_number: `ORD-${String(id).padStart(4, "0")}`, customer_name: customer.trim(), status: "PENDING", created_at: new Date().toISOString(),
      items: priced.map((l) => ({ product_id: l.product.id, product_name_snapshot: l.product.name, sku_snapshot: l.product.sku, quantity: Number(l.quantity), unit_price: l.product.unit_price })),
    };
    update("orders", (os) => [...os, order]);
    toast(`${order.order_number} created as Pending (demo only)`);
    onCreated(order.id);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      icon={ShoppingCart}
      title="Create order"
      description="Orders start as Pending. Stock is deducted only when the order is confirmed."
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="order-form" className="btn btn-primary" disabled={!active.length}>Create order</button>
      </>}
    >
      <form id="order-form" onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Customer name" error={errors.customer}>{(p) => <input className="input" {...p} value={customer} onChange={(e) => setCustomer(e.target.value)} />}</Field>
        {priced.map((l, i) => (
          <div className="item-row" key={i}>
            <Field label={`Product ${i + 1}`}>
              {(p) => <select className="input" {...p} value={l.product_id} onChange={setLine(i, "product_id")}>{active.map((x) => <option key={x.id} value={x.id}>{x.name} · {formatINR(x.unit_price)} · {x.quantity_on_hand} in stock</option>)}</select>}
            </Field>
            <Field label="Qty" error={errors[`q${i}`]}>{(p) => <input className="input num" inputMode="numeric" {...p} value={l.quantity} onChange={setLine(i, "quantity")} />}</Field>
            <button type="button" className="btn btn-subtle btn-icon" aria-label={`Remove product ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden="true" /></button>
          </div>
        ))}
        {errors.lines && <p className="field-error" role="alert">{errors.lines}</p>}
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setLines((ls) => [...ls, { product_id: String(active[0]?.id ?? ""), quantity: "1" }])}>
          <Plus size={16} aria-hidden="true" />Add product
        </button>
        <div className="total-row"><span>Estimated total</span><span className="num">{formatINR(estimate)}</span></div>
        <p className="muted" style={{ fontSize: 12 }}>The server calculates the final total from current prices.</p>
      </form>
    </Dialog>
  );
}

function OrderDrawer({ orderId, onClose }) {
  const { orders, update } = useStore();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const order = orders.find((o) => o.id === orderId);
  const reached = STEPS.indexOf(order.status);

  const move = (to) => {
    update("orders", (os) => os.map((o) => (o.id === order.id ? { ...o, status: to } : o)));
    toast(`${order.order_number} is now ${orderLabel(to)} (demo: stock rules run in the backend from Phase 4)`);
    setConfirmCancel(false);
  };

  return (
    <Dialog
      open
      drawer
      onClose={onClose}
      icon={ClipboardList}
      title={order.order_number}
      description={`${order.customer_name} · ${formatDate(order.created_at)}`}
      footer={NEXT_STATUS[order.status].length ? NEXT_STATUS[order.status].map((to) => (
        to === "CANCELLED"
          ? <button key={to} className="btn btn-danger" onClick={() => setConfirmCancel(true)}><Ban size={16} aria-hidden="true" />{ACTION[to]}</button>
          : <button key={to} className="btn btn-primary" onClick={() => move(to)}><Check size={16} aria-hidden="true" />{ACTION[to]}</button>
      )) : <span className="muted">This order is {orderLabel(order.status).toLowerCase()}. No further changes.</span>}
    >
      <OrderBadge status={order.status} />
      {order.status === "CANCELLED" ? (
        <p className="demo-banner"><Ban size={16} aria-hidden="true" />Cancelled. Confirmed orders get their stock restored when cancelled.</p>
      ) : (
        <ol className="stepper" aria-label="Fulfilment progress" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {STEPS.map((s, i) => (
            <li key={s} className={`step ${i <= reached ? "done" : ""}`} aria-current={i === reached ? "step" : undefined}>
              <span className="step-dot">{i <= reached ? <Check size={14} aria-hidden="true" /> : i + 1}</span>
              {orderLabel(s)}
            </li>
          ))}
        </ol>
      )}
      <h3>Items</h3>
      <div className="lines">
        {order.items.map((i) => (
          <div className="line" key={i.product_id}>
            <span className="identity"><strong>{i.product_name_snapshot}</strong><span>{i.quantity} × {formatINR(i.unit_price)} · <span className="mono">{i.sku_snapshot}</span></span></span>
            <span className="num">{formatINR(i.quantity * i.unit_price)}</span>
          </div>
        ))}
      </div>
      <div className="total-row"><span>Total</span><span className="num">{formatINR(orderTotal(order))}</span></div>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        icon={Ban}
        title={`Cancel ${order.order_number}?`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setConfirmCancel(false)}>Keep order</button>
          <button className="btn btn-danger-solid" onClick={() => move("CANCELLED")}><Ban size={16} aria-hidden="true" />Cancel order</button>
        </>}
      >
        <p>{order.status === "CONFIRMED" ? "The deducted stock will be returned to inventory." : "No stock has been deducted for this pending order."} This cannot be undone.</p>
      </Dialog>
    </Dialog>
  );
}

export default function Orders() {
  const { orders } = useStore();
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const q = query.trim().toLowerCase();
  const rows = [...orders]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((o) => (!filter || o.status === filter) && (!q || o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q)));

  return (
    <>
      <PageHeader title="Orders" description="Create orders and move them through fulfilment.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" />Create order</button>
      </PageHeader>
      <DemoBanner />

      <section className="panel">
        <div className="filters">
          <div className="page-actions" role="group" aria-label="Filter by status">
            {["", ...STATUSES].map((s) => (
              <button key={s || "all"} className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-secondary"}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
                {s ? orderLabel(s) : "All"} <span className="num">({s ? orders.filter((o) => o.status === s).length : orders.length})</span>
              </button>
            ))}
          </div>
          <label className="search">
            <span className="visually-hidden">Search orders</span>
            <Search size={16} aria-hidden="true" />
            <input className="input" type="search" placeholder="Search order number or customer" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Order</th><th>Customer</th><th>Created</th><th className="right">Items</th><th className="right">Total</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => setOpenId(o.id)}>
                    <td><button className="btn btn-subtle btn-sm mono" onClick={(e) => { e.stopPropagation(); setOpenId(o.id); }}>{o.order_number}</button></td>
                    <td>{o.customer_name}</td>
                    <td>{formatDate(o.created_at)}</td>
                    <td className="right num">{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                    <td className="right num">{formatINR(orderTotal(o))}</td>
                    <td><OrderBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : orders.length ? (
          <EmptyState icon={Search} title="No orders match" action={<button className="btn btn-secondary" onClick={() => { setFilter(""); setQuery(""); }}>Clear filters</button>} />
        ) : (
          <EmptyState icon={ShoppingCart} title="No orders yet" text="Create an order to start tracking fulfilment." />
        )}
      </section>

      {creating && <CreateOrderDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
      {openId && <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
