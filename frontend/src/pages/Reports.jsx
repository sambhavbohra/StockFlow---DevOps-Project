import { useEffect, useState } from "react";
import { ChartColumn } from "lucide-react";
import { api } from "../api.js";
import { formatDate, formatINR } from "../format.js";
import { EmptyState, ErrorState, Field, PageHeader, Skeleton, StockBadge, orderLabel } from "../ui.jsx";

function HBars({ rows, format = String, label }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value)));
  return (
    <div role="list" aria-label={label}>
      {rows.map((r) => (
        <div className="hbar" role="listitem" key={r.label}>
          <span>{r.label}</span>
          <span className="hbar-track" aria-hidden="true"><span className="hbar-fill" style={{ display: "block", width: `${(Number(r.value) / max) * 100}%` }} /></span>
          <span className="num">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const [range, setRange] = useState({ from: "", to: "" });
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [reloadKey, setReloadKey] = useState(0);
  const invalidRange = range.from && range.to && range.from > range.to;

  useEffect(() => {
    if (invalidRange) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ ...(range.from && { date_from: range.from }), ...(range.to && { date_to: range.to }) });
    api(`/reports/summary?${query}`, { signal: controller.signal })
      .then((data) => setState({ status: "ready", data, error: "" }))
      .catch((err) => { if (err.name !== "AbortError") setState({ status: "error", data: null, error: err.message }); });
    return () => controller.abort();
  }, [range, reloadKey, invalidRange]);

  const set = (k) => (e) => setRange((r) => ({ ...r, [k]: e.target.value }));
  const d = state.data;

  let body;
  if (state.status === "loading") body = <section className="panel"><Skeleton rows={6} /></section>;
  else if (state.status === "error") body = <section className="panel"><ErrorState message={state.error} onRetry={() => { setState((s) => ({ ...s, status: "loading" })); setReloadKey((k) => k + 1); }} /></section>;
  else body = (
    <>
      <div className="grid-2-even">
        <section className="panel">
          <div className="panel-head"><h2>Inventory value by category</h2><span className="num">{formatINR(d.inventory_value)}</span></div>
          <div className="panel-body">
            {d.inventory_by_category.length
              ? <HBars label="Inventory value by category" rows={d.inventory_by_category.map((c) => ({ label: c.category, value: c.value }))} format={formatINR} />
              : <p className="muted">No active products.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Orders by status</h2><span className="num">{d.order_count} orders · {formatINR(d.order_value)}</span></div>
          <div className="panel-body">
            {d.order_count
              ? <HBars label="Orders by status" rows={d.orders_by_status.map((s) => ({ label: orderLabel(s.status), value: s.count }))} />
              : <EmptyState icon={ChartColumn} title="No orders in this range" />}
            {d.order_count > 0 && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Order value excludes cancelled orders.</p>}
          </div>
        </section>
      </div>

      <div className="grid-2-even">
        <section className="panel">
          <div className="panel-head"><h2>Low and out of stock</h2></div>
          <div className="panel-body">
            {d.needs_restock.length ? (
              <ul className="list">{d.needs_restock.map((p) => <li key={p.id}><span>{p.name} · {p.quantity_on_hand} / min {p.reorder_threshold}</span><StockBadge product={p} /></li>)}</ul>
            ) : <p className="muted">Nothing needs restocking.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Stock movements</h2><span className="muted num">+{d.units_in} in · −{d.units_out} out</span></div>
          <div className="panel-body">
            {d.movements.length ? (
              <ul className="list">
                {d.movements.map((m) => (
                  <li key={m.id}>
                    <span className="identity"><strong>{m.movement_type === "IN" ? "+" : "−"}{m.quantity} {m.product_name}</strong><span>{m.reason}</span></span>
                    <span className="muted">{formatDate(m.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={ChartColumn} title="No movements in this range" />}
            {d.movement_count > d.movements.length && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Showing the latest {d.movements.length} of {d.movement_count}.</p>}
          </div>
        </section>
      </div>
    </>
  );

  return (
    <>
      <PageHeader title="Reports" description="Inventory value, order status and stock activity." />
      <section className="panel">
        <div className="filters">
          <Field label="From" error={invalidRange ? "Must be on or before the end date." : undefined}>
            {(p) => <input className="input" type="date" {...p} value={range.from} max={range.to || undefined} onChange={set("from")} />}
          </Field>
          <Field label="To">{(p) => <input className="input" type="date" {...p} value={range.to} min={range.from || undefined} onChange={set("to")} />}</Field>
          <button className="btn btn-subtle" style={{ alignSelf: "flex-end" }} onClick={() => setRange({ from: "", to: "" })} disabled={!range.from && !range.to}>Clear dates</button>
          <span className="muted" style={{ alignSelf: "flex-end" }}>Dates (India time) filter orders and movements. Inventory value is always current.</span>
        </div>
      </section>
      {body}
    </>
  );
}
