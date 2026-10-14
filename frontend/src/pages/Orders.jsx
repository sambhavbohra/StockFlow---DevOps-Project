import { useCallback, useEffect, useState } from "react";
import { Ban, Check, CircleAlert, ClipboardList, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { NEXT_STATUS, formatDate, formatINR } from "../format.js";
import { Dialog, EmptyState, ErrorState, Field, OrderBadge, PageHeader, Skeleton, orderLabel, useToast } from "../ui.jsx";

const STATUSES = Object.keys(NEXT_STATUS);
const STEPS = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"];
const ACTION = { CONFIRMED: "Confirm order", SHIPPED: "Mark shipped", DELIVERED: "Mark delivered", CANCELLED: "Cancel order" };
const money = (v) => formatINR(Number(v));

function CreateOrderDialog({ onClose, onCreated }) {
  const toast = useToast();
  const [products, setProducts] = useState(null); // null = loading
  const [loadError, setLoadError] = useState("");
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/products").then((rows) => {
      setProducts(rows);
      setLines([{ product_id: String(rows[0]?.id ?? ""), quantity: "1" }]);
    }).catch((err) => setLoadError(err.message));
  }, []);

  const setLine = (i, k) => (e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));
  const priced = lines.map((l) => ({ ...l, product: products?.find((p) => p.id === Number(l.product_id)) }));
  const estimate = priced.reduce((s, l) => s + (l.product && /^\d+$/.test(l.quantity) ? Number(l.product.unit_price) * Number(l.quantity) : 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!customer.trim()) errs.customer_name = "Customer name is required.";
    priced.forEach((l, i) => { if (!/^\d+$/.test(l.quantity) || Number(l.quantity) <= 0) errs[`q${i}`] = "Whole number above 0."; });
    if (new Set(lines.map((l) => l.product_id)).size !== lines.length) errs.items = "Each product can appear only once.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const order = await api("/orders", {
        method: "POST",
        body: { customer_name: customer, items: lines.map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity) })) },
      });
      toast(`${order.order_number} created as Pending`);
      onCreated(order.id);
    } catch (err) {
      if (err.status === 422) setErrors(err.fields);
      else setErrors({ items: err.message }); // 404/409: product missing or archived since the form opened
    } finally {
      setSaving(false);
    }
  };

  let content;
  if (loadError) content = <ErrorState message={loadError} />;
  else if (!products) content = <Skeleton rows={3} />;
  else if (!products.length) content = <EmptyState icon={ShoppingCart} title="No products to order" text="Add an active product first." />;
  else content = (
    <form id="order-form" onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Customer name" error={errors.customer_name}>{(p) => <input className="input" {...p} value={customer} maxLength={120} onChange={(e) => setCustomer(e.target.value)} />}</Field>
      {priced.map((l, i) => (
        <div className="item-row" key={i}>
          <Field label={`Product ${i + 1}`}>
            {(p) => <select className="input" {...p} value={l.product_id} onChange={setLine(i, "product_id")}>{products.map((x) => <option key={x.id} value={x.id}>{x.name} · {money(x.unit_price)} · {x.quantity_on_hand} in stock</option>)}</select>}
          </Field>
          <Field label="Qty" error={errors[`q${i}`]}>{(p) => <input className="input num" inputMode="numeric" {...p} value={l.quantity} onChange={setLine(i, "quantity")} />}</Field>
          <button type="button" className="btn btn-subtle btn-icon" aria-label={`Remove product ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      ))}
      {errors.items && <p className="field-error" role="alert"><CircleAlert size={14} aria-hidden="true" />{errors.items}</p>}
      <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setLines((ls) => [...ls, { product_id: String(products[0].id), quantity: "1" }])}>
        <Plus size={16} aria-hidden="true" />Add product
      </button>
      <div className="total-row"><span>Estimated total</span><span className="num">{formatINR(estimate)}</span></div>
      <p className="muted" style={{ fontSize: 12 }}>The server calculates the final total from current prices. Stock is deducted when the order is confirmed.</p>
    </form>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      icon={ShoppingCart}
      title="Create order"
      description="Orders start as Pending. Stock is deducted only when the order is confirmed."
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="order-form" className="btn btn-primary" disabled={!products?.length || saving}>{saving ? "Creating…" : "Create order"}</button>
      </>}
    >
      {content}
    </Dialog>
  );
}

function OrderDrawer({ order, onClose, onChanged }) {
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reached = STEPS.indexOf(order.status);

  const move = async (to) => {
    setBusy(true);
    setError("");
    try {
      const updated = await api(`/orders/${order.id}/status`, { method: "PUT", body: { status: to } });
      toast(`${updated.order_number} is now ${orderLabel(updated.status).toLowerCase()}`);
      onChanged();
    } catch (err) {
      setError(err.message); // e.g. not enough stock to confirm; nothing was changed
      if (err.status === 409) onChanged(); // someone else may have moved it; refresh the view
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  const actions = NEXT_STATUS[order.status];
  return (
    <Dialog
      open
      drawer
      onClose={onClose}
      icon={ClipboardList}
      title={order.order_number}
      description={`${order.customer_name} · ${formatDate(order.created_at)}`}
      footer={actions.length ? actions.map((to) => (
        to === "CANCELLED"
          ? <button key={to} className="btn btn-danger" disabled={busy} onClick={() => setConfirmCancel(true)}><Ban size={16} aria-hidden="true" />{ACTION[to]}</button>
          : <button key={to} className="btn btn-primary" disabled={busy} onClick={() => move(to)}><Check size={16} aria-hidden="true" />{ACTION[to]}</button>
      )) : <span className="muted">This order is {orderLabel(order.status).toLowerCase()}. No further changes.</span>}
    >
      <OrderBadge status={order.status} />
      {error && <p className="state-error field-error" role="alert" style={{ padding: "8px 12px" }}><CircleAlert size={14} aria-hidden="true" />{error}</p>}
      {order.status === "CANCELLED" ? (
        <p className="note"><Ban size={16} aria-hidden="true" />Cancelled{order.confirmed_at ? "; its deducted stock was returned to inventory" : ""}.</p>
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
            <span className="identity"><strong>{i.product_name_snapshot}</strong><span>{i.quantity} × {money(i.unit_price)} · <span className="mono">{i.sku_snapshot}</span></span></span>
            <span className="num">{money(i.line_total)}</span>
          </div>
        ))}
      </div>
      <div className="total-row"><span>Total</span><span className="num">{money(order.subtotal)}</span></div>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        icon={Ban}
        title={`Cancel ${order.order_number}?`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setConfirmCancel(false)}>Keep order</button>
          <button className="btn btn-danger-solid" disabled={busy} onClick={() => move("CANCELLED")}><Ban size={16} aria-hidden="true" />Cancel order</button>
        </>}
      >
        <p>{order.status === "CONFIRMED" ? "The deducted stock will be returned to inventory." : "No stock has been deducted for this pending order."} This cannot be undone.</p>
      </Dialog>
    </Dialog>
  );
}

export default function Orders() {
  const [state, setState] = useState({ status: "loading", orders: [], error: "" });
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Search is server-side; the status tabs filter locally so every tab can show its count.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api(`/orders?${new URLSearchParams(query.trim() ? { search: query.trim() } : {})}`, { signal: controller.signal })
        .then((orders) => setState({ status: "ready", orders, error: "" }))
        .catch((err) => { if (err.name !== "AbortError") setState((s) => ({ ...s, status: "error", error: err.message })); });
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, reloadKey]);

  const { orders } = state;
  const rows = orders.filter((o) => !filter || o.status === filter);
  const open = orders.find((o) => o.id === openId);

  let body;
  if (state.status === "loading") body = <Skeleton rows={5} />;
  else if (state.status === "error") body = <ErrorState message={state.error} onRetry={() => { setState((s) => ({ ...s, status: "loading" })); reload(); }} />;
  else if (!rows.length && (filter || query)) body = <EmptyState icon={Search} title="No orders match" action={<button className="btn btn-secondary" onClick={() => { setFilter(""); setQuery(""); }}>Clear filters</button>} />;
  else if (!rows.length) body = <EmptyState icon={ShoppingCart} title="No orders yet" text="Create an order to start tracking fulfilment." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Create order</button>} />;
  else body = (
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
              <td className="right num">{money(o.subtotal)}</td>
              <td><OrderBadge status={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <PageHeader title="Orders" description="Create orders and move them through fulfilment.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" />Create order</button>
      </PageHeader>

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
            <input className="input" type="search" placeholder="Search order number or customer" value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        {body}
      </section>

      {creating && <CreateOrderDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); reload(); }} />}
      {open && <OrderDrawer key={open.id} order={open} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
