import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, History, IndianRupee, Package, Plus, ShoppingCart, TriangleAlert } from "lucide-react";
import { api } from "../api.js";
import { formatDate, formatDay, formatINR } from "../format.js";
import { EmptyState, ErrorState, OrderBadge, PageHeader, Skeleton, StockBadge } from "../ui.jsx";

function MovementChart({ days }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.units_in, d.units_out]));
  if (max === 1 && days.every((d) => !d.units_in && !d.units_out)) return <p className="muted">No stock movements in the last 7 days.</p>;
  return (
    <figure style={{ margin: 0 }}>
      <div className="legend">
        <span><i className="swatch" style={{ background: "var(--caviar)" }} />Stock in</span>
        <span><i className="swatch" style={{ background: "var(--mustang)" }} />Stock out</span>
      </div>
      <div className="bars">
        {days.map((d) => (
          <div className="bar-group" key={d.day}>
            <div className="bar-pair">
              <div className="bar" style={{ height: `${(d.units_in / max) * 100}%`, background: "var(--caviar)" }} title={`${formatDay(d.day)}: ${d.units_in} units in`} />
              <div className="bar" style={{ height: `${(d.units_out / max) * 100}%`, background: "var(--mustang)" }} title={`${formatDay(d.day)}: ${d.units_out} units out`} />
            </div>
            <span className="bar-label">{formatDay(d.day)}</span>
            <span className="visually-hidden">{d.units_in} units in, {d.units_out} units out</span>
          </div>
        ))}
      </div>
      <figcaption className="visually-hidden">Units moved in and out per day over the last 7 days</figcaption>
    </figure>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => { setState((s) => ({ ...s, status: "loading" })); setReloadKey((k) => k + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    api("/dashboard/summary", { signal: controller.signal })
      .then((data) => setState({ status: "ready", data, error: "" }))
      .catch((err) => { if (err.name !== "AbortError") setState({ status: "error", data: null, error: err.message }); });
    return () => controller.abort();
  }, [reloadKey]);

  const header = (
    <PageHeader title="Overview" description="Inventory and order activity at a glance. Updated live during the demo.">
      <Link className="btn btn-secondary" to="/orders">View orders</Link>
      <button className="btn btn-primary" onClick={() => navigate("/products?new=1")}><Plus size={18} aria-hidden="true" /> Add product</button>
    </PageHeader>
  );
  if (state.status === "loading") return <>{header}<section className="panel"><Skeleton rows={6} /></section></>;
  if (state.status === "error") return <>{header}<section className="panel"><ErrorState message={state.error} onRetry={reload} /></section></>;

  const d = state.data;
  if (!d.product_count && !d.recent_orders.length) {
    return <>{header}<section className="panel"><EmptyState icon={Package} title="Nothing to show yet" text="Add products to see stock levels, movements and orders here." action={<button className="btn btn-primary" onClick={() => navigate("/products?new=1")}>Add product</button>} /></section></>;
  }

  const kpis = [
    ["Products", d.product_count, `${d.total_units} units on hand`, Package],
    ["Inventory value", formatINR(d.inventory_value), "Quantity × unit price", IndianRupee],
    ["Pending orders", d.pending_orders, "Awaiting confirmation", ShoppingCart],
    ["Low / out of stock", d.low_stock_count + d.out_of_stock_count, `${d.out_of_stock_count} out of stock`, TriangleAlert],
  ];

  return (
    <>
      {header}
      <section className="kpis" aria-label="Summary">
        {kpis.map(([label, value, sub, Icon]) => (
          <div className="panel kpi" key={label}>
            <span className="kpi-label">{label}<Icon size={18} aria-hidden="true" /></span>
            <span className="kpi-value num">{value}</span>
            <span className="muted">{sub}</span>
          </div>
        ))}
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Inventory movement</h2><span className="muted">Last 7 days</span></div>
          <div className="panel-body"><MovementChart days={d.movement_chart} /></div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Needs restocking</h2><Link to="/inventory" className="btn btn-subtle btn-sm">Inventory <ArrowRight size={14} aria-hidden="true" /></Link></div>
          <div className="panel-body">
            {d.needs_restock.length ? (
              <ul className="list">
                {d.needs_restock.map((p) => (
                  <li key={p.id}>
                    <span className="identity"><strong>{p.name}</strong><span className="mono">{p.sku}</span> · {p.quantity_on_hand} left (min {p.reorder_threshold})</span>
                    <StockBadge product={p} />
                  </li>
                ))}
              </ul>
            ) : <p className="muted">All products are above their reorder threshold.</p>}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Recent orders</h2><Link to="/orders" className="btn btn-subtle btn-sm">All orders <ArrowRight size={14} aria-hidden="true" /></Link></div>
          {d.recent_orders.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Customer</th><th className="right">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {d.recent_orders.map((o) => (
                    <tr key={o.id}>
                      <td className="mono">{o.order_number}</td>
                      <td>{o.customer_name}</td>
                      <td className="right num">{formatINR(o.subtotal)}</td>
                      <td><OrderBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={ShoppingCart} title="No orders yet" />}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Recent activity</h2></div>
          <div className="panel-body">
            {d.recent_movements.length ? (
              <ul className="list">
                {d.recent_movements.map((m) => (
                  <li key={m.id}>
                    <span className="identity">
                      <strong>{m.movement_type === "IN" ? "+" : "−"}{m.quantity} {m.product_name}</strong>
                      <span>{m.reason} · {formatDate(m.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={History} title="No stock movements yet" />}
          </div>
        </section>
      </div>
    </>
  );
}
