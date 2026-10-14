import { useState } from "react";
import { ChartColumn } from "lucide-react";
import { NEXT_STATUS, formatDate, formatINR, orderTotal, stockStatus, useStore } from "../demoData.js";
import { DemoBanner, EmptyState, Field, PageHeader, StockBadge, orderLabel } from "../ui.jsx";

function HBars({ rows, format = String }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => (
    <div className="hbar" key={r.label}>
      <span>{r.label}</span>
      <span className="hbar-track" aria-hidden="true"><span className="hbar-fill" style={{ display: "block", width: `${(r.value / max) * 100}%` }} /></span>
      <span className="num">{format(r.value)}</span>
    </div>
  ));
}

export default function Reports() {
  const { products, movements, orders } = useStore();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inRange = (iso) => (!from || iso.slice(0, 10) >= from) && (!to || iso.slice(0, 10) <= to);

  const active = products.filter((p) => p.is_active);
  const byCategory = Object.entries(active.reduce((acc, p) => ({ ...acc, [p.category]: (acc[p.category] ?? 0) + p.quantity_on_hand * p.unit_price }), {}))
    .map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const rangedOrders = orders.filter((o) => inRange(o.created_at));
  const byStatus = Object.keys(NEXT_STATUS).map((s) => ({ label: orderLabel(s), value: rangedOrders.filter((o) => o.status === s).length }));
  const attention = active.filter((p) => stockStatus(p) !== "in");
  const rangedMoves = movements.filter((m) => inRange(m.created_at)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const productName = (id) => products.find((p) => p.id === id)?.name ?? "Unknown product";

  return (
    <>
      <PageHeader title="Reports" description="Inventory value, order status and stock activity." />
      <DemoBanner />

      <section className="panel">
        <div className="filters">
          <Field label="From">{(p) => <input className="input" type="date" {...p} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To">{(p) => <input className="input" type="date" {...p} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />}</Field>
          <button className="btn btn-subtle" style={{ alignSelf: "flex-end" }} onClick={() => { setFrom(""); setTo(""); }} disabled={!from && !to}>Clear dates</button>
          <span className="muted" style={{ alignSelf: "flex-end" }}>Dates filter orders and movements. Inventory value is always current.</span>
        </div>
      </section>

      <div className="grid-2-even">
        <section className="panel">
          <div className="panel-head"><h2>Inventory value by category</h2><span className="num">{formatINR(byCategory.reduce((s, r) => s + r.value, 0))}</span></div>
          <div className="panel-body">{byCategory.length ? <HBars rows={byCategory} format={formatINR} /> : <p className="muted">No active products.</p>}</div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Orders by status</h2><span className="num">{rangedOrders.length} orders · {formatINR(rangedOrders.reduce((s, o) => s + orderTotal(o), 0))}</span></div>
          <div className="panel-body">{rangedOrders.length ? <HBars rows={byStatus} /> : <EmptyState icon={ChartColumn} title="No orders in this range" />}</div>
        </section>
      </div>

      <div className="grid-2-even">
        <section className="panel">
          <div className="panel-head"><h2>Low and out of stock</h2></div>
          <div className="panel-body">
            {attention.length ? (
              <ul className="list">{attention.map((p) => <li key={p.id}><span>{p.name} · {p.quantity_on_hand} / min {p.reorder_threshold}</span><StockBadge product={p} /></li>)}</ul>
            ) : <p className="muted">Nothing needs restocking.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Stock movements</h2><span className="muted">{rangedMoves.length} in range</span></div>
          <div className="panel-body">
            {rangedMoves.length ? (
              <ul className="list">
                {rangedMoves.slice(0, 8).map((m) => (
                  <li key={m.id}>
                    <span className="identity"><strong>{m.movement_type === "IN" ? "+" : "−"}{m.quantity} {productName(m.product_id)}</strong><span>{m.reason}</span></span>
                    <span className="muted">{formatDate(m.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={ChartColumn} title="No movements in this range" />}
          </div>
        </section>
      </div>
    </>
  );
}
