import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, History, SlidersHorizontal, Warehouse } from "lucide-react";
import { api } from "../api.js";
import { formatDate } from "../format.js";
import { Dialog, EmptyState, ErrorState, Field, PageHeader, Skeleton, StockBadge, useToast } from "../ui.jsx";

const REASONS = { IN: ["Restock", "Customer return", "Stock count correction"], OUT: ["Damaged", "Lost", "Internal use", "Stock count correction"] };

function AdjustDialog({ products, productId, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ product_id: String(productId ?? products[0]?.id ?? ""), type: "IN", quantity: "", reason: "Restock", notes: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const product = products.find((p) => p.id === Number(form.product_id));
  const qty = /^\d+$/.test(form.quantity) ? Number(form.quantity) : 0;
  const after = product ? product.quantity_on_hand + (form.type === "IN" ? qty : -qty) : 0;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setType = (type) => setForm((f) => ({ ...f, type, reason: REASONS[type][0] }));

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d+$/.test(form.quantity) || qty <= 0) return setErrors({ quantity: "Enter a whole number greater than 0." });
    if (after < 0) return setErrors({ quantity: `Only ${product.quantity_on_hand} in stock. Stock out can't go below zero.` });
    setErrors({});
    setSaving(true);
    try {
      const m = await api("/inventory/adjustments", {
        method: "POST",
        body: { product_id: product.id, movement_type: form.type, quantity: qty, reason: form.reason, notes: form.notes.trim() || null },
      });
      toast(`${m.product_name}: ${m.quantity_before} → ${m.quantity_after} units`);
      onSaved();
    } catch (err) {
      // 409: stock changed since the page loaded, or the product was archived. Keep the form as typed.
      if (err.status === 409) setErrors({ quantity: err.message });
      else if (err.status === 422) setErrors(err.fields);
      else toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      icon={SlidersHorizontal}
      title="Adjust stock"
      description="Record stock received or removed. Every change is kept in the movement history."
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="adjust-form" className="btn btn-primary" disabled={!product || saving}>{saving ? "Saving…" : "Confirm adjustment"}</button>
      </>}
    >
      <form id="adjust-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Product" className="full">
          {(p) => (
            <select className="input" {...p} value={form.product_id} onChange={set("product_id")}>
              {products.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.sku}) · {x.quantity_on_hand} on hand</option>)}
            </select>
          )}
        </Field>
        <div className="field full">
          <span id="type-label" style={{ fontWeight: 550, fontSize: 13 }}>Movement type</span>
          <div className="segmented" role="group" aria-labelledby="type-label">
            <button type="button" aria-pressed={form.type === "IN"} onClick={() => setType("IN")}><ArrowDownToLine size={16} aria-hidden="true" />Stock in</button>
            <button type="button" aria-pressed={form.type === "OUT"} onClick={() => setType("OUT")}><ArrowUpFromLine size={16} aria-hidden="true" />Stock out</button>
          </div>
        </div>
        <Field label="Quantity" error={errors.quantity}>{(p) => <input className="input num" inputMode="numeric" {...p} value={form.quantity} onChange={set("quantity")} />}</Field>
        <Field label="Reason" error={errors.reason}>
          {(p) => <select className="input" {...p} value={form.reason} onChange={set("reason")}>{REASONS[form.type].map((r) => <option key={r}>{r}</option>)}</select>}
        </Field>
        <Field label="Note (optional)" error={errors.notes} className="full">{(p) => <input className="input" {...p} value={form.notes} maxLength={1000} onChange={set("notes")} />}</Field>
        {product && (
          <div className="impact full" aria-live="polite">
            <span className="kpi-label">Resulting quantity</span>
            <div className="impact-value num">
              {product.quantity_on_hand} <ArrowRight size={20} aria-hidden="true" /> {after < 0 ? "Not allowed" : `${after} units`}
            </div>
          </div>
        )}
      </form>
    </Dialog>
  );
}

export default function Inventory() {
  const [state, setState] = useState({ status: "loading", products: [], movements: [], error: "" });
  const [reloadKey, setReloadKey] = useState(0);
  const [adjusting, setAdjusting] = useState(undefined); // undefined = closed, null = pick product, id = preselected
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api("/products", { signal: controller.signal }),
      api("/inventory/movements?limit=100", { signal: controller.signal }),
    ]).then(([products, movements]) => {
      setState({ status: "ready", products: products.sort((a, b) => a.quantity_on_hand - b.quantity_on_hand), movements, error: "" });
    }).catch((err) => {
      if (err.name !== "AbortError") setState((s) => ({ ...s, status: "error", error: err.message }));
    });
    return () => controller.abort();
  }, [reloadKey]);

  const { status, products, movements } = state;
  const retry = () => { setState((s) => ({ ...s, status: "loading" })); reload(); };

  return (
    <>
      <PageHeader title="Inventory" description="Current stock levels and every recorded movement.">
        <button className="btn btn-primary" onClick={() => setAdjusting(null)} disabled={status !== "ready" || !products.length}>
          <SlidersHorizontal size={18} aria-hidden="true" />Adjust stock
        </button>
      </PageHeader>

      {status === "error" ? <section className="panel"><ErrorState message={state.error} onRetry={retry} /></section> : <>
        <section className="panel">
          <div className="panel-head"><h2>Current stock</h2><span className="muted">Lowest first</span></div>
          {status === "loading" ? <Skeleton rows={4} /> : products.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th className="right">On hand</th><th className="right">Reorder at</th><th>Status</th><th className="right"><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="identity"><strong>{p.name}</strong><span className="mono">{p.sku}</span></td>
                      <td className="right num">{p.quantity_on_hand}</td>
                      <td className="right num">{p.reorder_threshold}</td>
                      <td><StockBadge product={p} /></td>
                      <td className="right"><button className="btn btn-secondary btn-sm" onClick={() => setAdjusting(p.id)} aria-label={`Adjust stock for ${p.name}`}>Adjust</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={Warehouse} title="No active products" text="Add products before recording stock." />}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Movement history</h2><span className="muted">Latest 100</span></div>
          {status === "loading" ? <Skeleton rows={4} /> : movements.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Product</th><th>Type</th><th className="right">Qty</th><th className="right">Before → after</th><th>Reason</th></tr></thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDate(m.created_at)}</td>
                      <td className="identity"><strong>{m.product_name}</strong><span className="mono">{m.product_sku}</span></td>
                      <td>
                        <span className="badge badge-plain">
                          {m.movement_type === "IN" ? <ArrowDownToLine size={14} aria-hidden="true" /> : <ArrowUpFromLine size={14} aria-hidden="true" />}
                          {m.movement_type === "IN" ? "Stock in" : "Stock out"}
                        </span>
                      </td>
                      <td className="right num">{m.quantity}</td>
                      <td className="right num">{m.quantity_before} → {m.quantity_after}</td>
                      <td>{m.reason}{m.notes && <span className="muted"> · {m.notes}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={History} title="No movements yet" text="Stock adjustments and confirmed orders appear here." />}
        </section>
      </>}

      {adjusting !== undefined && (
        <AdjustDialog products={products} productId={adjusting} onClose={() => setAdjusting(undefined)} onSaved={() => { setAdjusting(undefined); reload(); }} />
      )}
    </>
  );
}
