import { Link, useNavigate } from "react-router";
import { ArrowRight, IndianRupee, Package, Plus, ShoppingCart, TriangleAlert } from "lucide-react";
import { formatDate, formatINR, orderTotal, stockStatus, useStore } from "../demoData.js";
import { DemoBanner, OrderBadge, PageHeader, StockBadge } from "../ui.jsx";

const day = (iso) => iso.slice(0, 10);

// Stock in vs out per day for the 7 days ending at the latest movement (deterministic for demo data).
function MovementChart({ movements }) {
  if (!movements.length) return <p className="muted">No stock movements recorded yet.</p>;
  const end = new Date(day(movements.map((m) => m.created_at).sort().at(-1)));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(end);
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const sum = (type) => movements.filter((m) => day(m.created_at) === key && m.movement_type === type).reduce((s, m) => s + m.quantity, 0);
    return { key, label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), in: sum("IN"), out: sum("OUT") };
  });
  const max = Math.max(1, ...days.flatMap((d) => [d.in, d.out]));
  return (
    <figure style={{ margin: 0 }}>
      <div className="legend">
        <span><i className="swatch" style={{ background: "var(--caviar)" }} />Stock in</span>
        <span><i className="swatch" style={{ background: "var(--mustang)" }} />Stock out</span>
      </div>
      <div className="bars">
        {days.map((d) => (
          <div className="bar-group" key={d.key}>
            <div className="bar-pair">
              <div className="bar" style={{ height: `${(d.in / max) * 100}%`, background: "var(--caviar)" }} title={`${d.label}: ${d.in} units in`} />
              <div className="bar" style={{ height: `${(d.out / max) * 100}%`, background: "var(--mustang)" }} title={`${d.label}: ${d.out} units out`} />
            </div>
            <span className="bar-label">{d.label}</span>
            <span className="visually-hidden">{d.in} units in, {d.out} units out</span>
          </div>
        ))}
      </div>
      <figcaption className="visually-hidden">Units moved in and out per day over the last 7 days</figcaption>
    </figure>
  );
}

export default function Overview() {
  const { products, movements, orders } = useStore();
  const navigate = useNavigate();
  const active = products.filter((p) => p.is_active);
  const lowOrOut = active.filter((p) => stockStatus(p) !== "in");
  const kpis = [
    ["Products", active.length, `${active.reduce((s, p) => s + p.quantity_on_hand, 0)} units on hand`, Package],
    ["Inventory value", formatINR(active.reduce((s, p) => s + p.quantity_on_hand * p.unit_price, 0)), "Quantity × unit price", IndianRupee],
    ["Pending orders", orders.filter((o) => o.status === "PENDING").length, "Awaiting confirmation", ShoppingCart],
    ["Low / out of stock", lowOrOut.length, `${lowOrOut.filter((p) => stockStatus(p) === "out").length} out of stock`, TriangleAlert],
  ];
  const recentOrders = [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const recentMoves = [...movements].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const productName = (id) => products.find((p) => p.id === id)?.name ?? "Unknown product";

  return (
    <>
      <PageHeader title="Overview" description="Inventory and order activity at a glance.">
        <Link className="btn btn-secondary" to="/orders">View orders</Link>
        <button className="btn btn-primary" onClick={() => navigate("/products?new=1")}>
          <Plus size={18} aria-hidden="true" /> Add product
        </button>
      </PageHeader>
      <DemoBanner />

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
          <div className="panel-body"><MovementChart movements={movements} /></div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Needs restocking</h2><Link to="/inventory" className="btn btn-subtle btn-sm">Inventory <ArrowRight size={14} aria-hidden="true" /></Link></div>
          <div className="panel-body">
            {lowOrOut.length ? (
              <ul className="list">
                {lowOrOut.map((p) => (
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
          <div className="table-wrap">
            <table>
              <thead><tr><th>Order</th><th>Customer</th><th className="right">Total</th><th>Status</th></tr></thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">{o.order_number}</td>
                    <td>{o.customer_name}</td>
                    <td className="right num">{formatINR(orderTotal(o))}</td>
                    <td><OrderBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Recent activity</h2></div>
          <div className="panel-body">
            <ul className="list">
              {recentMoves.map((m) => (
                <li key={m.id}>
                  <span className="identity">
                    <strong>{m.movement_type === "IN" ? "+" : "−"}{m.quantity} {productName(m.product_id)}</strong>
                    <span>{m.reason} · {formatDate(m.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
