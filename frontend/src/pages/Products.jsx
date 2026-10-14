import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Archive, ArchiveRestore, Package, PackagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { formatINR } from "../format.js";
import { Dialog, EmptyState, ErrorState, Field, PageHeader, Skeleton, StockBadge, useToast } from "../ui.jsx";

const EMPTY = { name: "", sku: "", category: "General", unit_price: "", quantity_on_hand: "0", reorder_threshold: "10", description: "" };
const isWhole = (v) => /^\d+$/.test(String(v).trim());

// Editable fields for PUT /api/products/{id} (full replacement).
const toUpdate = (p, changes = {}) => ({
  name: p.name, sku: p.sku, category: p.category, description: p.description || null,
  unit_price: String(p.unit_price), reorder_threshold: Number(p.reorder_threshold), is_active: p.is_active, ...changes,
});

// Fast client-side feedback; the API is the authority (it also rejects duplicate SKUs).
function validate(form, isEdit) {
  const e = {};
  if (!form.name.trim()) e.name = "Product name is required.";
  if (!form.sku.trim()) e.sku = "SKU is required.";
  if (!form.category.trim()) e.category = "Category is required.";
  if (!/^\d+(\.\d{1,2})?$/.test(String(form.unit_price).trim())) e.unit_price = "Enter a price of 0 or more, with up to 2 decimals.";
  if (!isEdit && !isWhole(form.quantity_on_hand)) e.quantity_on_hand = "Enter a whole number of 0 or more.";
  if (!isWhole(form.reorder_threshold)) e.reorder_threshold = "Enter a whole number of 0 or more.";
  return e;
}

function ProductForm({ product, categories, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(product ? { ...EMPTY, ...product, description: product.description ?? "", unit_price: String(product.unit_price), reorder_threshold: String(product.reorder_threshold) } : EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(form, Boolean(product));
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      name: form.name, sku: form.sku, category: form.category, description: form.description.trim() || null,
      unit_price: form.unit_price.trim(), reorder_threshold: Number(form.reorder_threshold),
    };
    setSaving(true);
    try {
      const saved = product
        ? await api(`/products/${product.id}`, { method: "PUT", body: { ...body, is_active: product.is_active } })
        : await api("/products", { method: "POST", body: { ...body, quantity_on_hand: Number(form.quantity_on_hand) } });
      toast(`${saved.name} ${product ? "updated" : "added"}`);
      onSaved();
    } catch (err) {
      // Keep what the user typed; show the server's reason next to the right field.
      if (err.status === 409) setErrors({ sku: err.message });
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
      icon={PackagePlus}
      title={product ? "Edit product" : "Add product"}
      description="Identity, pricing and stock settings."
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="product-form" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save product"}</button>
      </>}
    >
      <form id="product-form" className="form-grid" onSubmit={submit} noValidate>
        <span className="form-section">Identity</span>
        <Field label="Product name" error={errors.name}>{(p) => <input className="input" {...p} value={form.name} maxLength={120} onChange={set("name")} />}</Field>
        <Field label="SKU" error={errors.sku} hint="Unique; stored in upper case.">{(p) => <input className="input mono" {...p} value={form.sku} maxLength={64} onChange={set("sku")} />}</Field>
        <Field label="Category" error={errors.category} className="full">
          {(p) => <>
            <input className="input" list="categories" {...p} value={form.category} maxLength={60} onChange={set("category")} />
            <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </>}
        </Field>
        <span className="form-section">Pricing and stock</span>
        <Field label="Unit price (₹)" error={errors.unit_price}>{(p) => <input className="input num" inputMode="decimal" {...p} value={form.unit_price} onChange={set("unit_price")} />}</Field>
        {product ? (
          <Field label="Quantity on hand" hint="Change stock from Inventory so every change is recorded.">{(p) => <input className="input num" {...p} value={product.quantity_on_hand} readOnly />}</Field>
        ) : (
          <Field label="Opening quantity" error={errors.quantity_on_hand}>{(p) => <input className="input num" inputMode="numeric" {...p} value={form.quantity_on_hand} onChange={set("quantity_on_hand")} />}</Field>
        )}
        <Field label="Reorder threshold" error={errors.reorder_threshold} hint="Low stock at or below this quantity.">{(p) => <input className="input num" inputMode="numeric" {...p} value={form.reorder_threshold} onChange={set("reorder_threshold")} />}</Field>
        <Field label="Description (optional)" error={errors.description} className="full">{(p) => <textarea className="input" {...p} value={form.description} onChange={set("description")} />}</Field>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ product, onClose, onDone }) {
  const toast = useToast();
  const [blocked, setBlocked] = useState(""); // API 409 message: product has history
  const [busy, setBusy] = useState(false);

  const run = async (request, success) => {
    setBusy(true);
    try {
      await request();
      toast(success);
      onDone();
    } catch (err) {
      if (err.status === 409) setBlocked(err.message);
      else toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = () => run(() => api(`/products/${product.id}`, { method: "DELETE" }), `${product.name} deleted`);
  const archive = () => run(() => api(`/products/${product.id}`, { method: "PUT", body: toUpdate(product, { is_active: false }) }), `${product.name} archived`);

  return (
    <Dialog
      open
      onClose={onClose}
      icon={blocked ? Archive : Trash2}
      title={blocked ? "This product has history" : `Delete ${product.name}?`}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {blocked
          ? <button className="btn btn-primary" onClick={archive} disabled={busy}><Archive size={16} aria-hidden="true" />Archive product</button>
          : <button className="btn btn-danger-solid" onClick={remove} disabled={busy}><Trash2 size={16} aria-hidden="true" />Delete product</button>}
      </>}
    >
      <p>
        {blocked
          ? `${blocked} Archived products disappear from lists and new orders, and you can restore them later.`
          : `${product.name} (${product.sku}) will be permanently removed. This cannot be undone.`}
      </p>
    </Dialog>
  );
}

export default function Products() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: "", category: "", stock_status: "", include_archived: false });
  const [state, setState] = useState({ status: "loading", rows: [], error: "" });
  const [categories, setCategories] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const adding = params.get("new") === "1";
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const filtered = Boolean(filters.search || filters.category || filters.stock_status || filters.include_archived);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== "" && v !== false));
    // Short debounce so typing in search doesn't send a request per keystroke.
    const timer = setTimeout(async () => {
      try {
        const rows = await api(`/products?${query}`, { signal: controller.signal });
        setState({ status: "ready", rows, error: "" });
        setCategories((c) => [...new Set([...c, ...rows.map((p) => p.category)])].sort());
      } catch (err) {
        if (err.name !== "AbortError") setState((s) => ({ ...s, status: "error", error: err.message }));
      }
    }, filters.search ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, reloadKey]);

  const restore = async (p) => {
    try {
      await api(`/products/${p.id}`, { method: "PUT", body: toUpdate(p, { is_active: true }) });
      toast(`${p.name} restored`);
      reload();
    } catch (err) {
      toast(err.message, "error");
    }
  };
  const closeForm = () => { setEditing(null); setParams({}); };
  const openAdd = () => setParams({ new: "1" });

  let body;
  if (state.status === "loading") body = <Skeleton rows={5} />;
  else if (state.status === "error") body = <ErrorState message={state.error} onRetry={() => { setState((s) => ({ ...s, status: "loading" })); reload(); }} />;
  else if (!state.rows.length && filtered) body = <EmptyState icon={Search} title="No products match these filters" action={<button className="btn btn-secondary" onClick={() => setFilters({ search: "", category: "", stock_status: "", include_archived: false })}>Clear filters</button>} />;
  else if (!state.rows.length) body = <EmptyState icon={Package} title="No products yet" text="Add your first product to start tracking stock." action={<button className="btn btn-primary" onClick={openAdd}>Add product</button>} />;
  else body = (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Product</th><th>Category</th><th className="right">Price</th><th className="right">Qty</th><th>Status</th><th className="right"><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
          {state.rows.map((p) => (
            <tr key={p.id}>
              <td className="identity"><strong>{p.name}</strong><span className="mono">{p.sku}</span></td>
              <td>{p.category}</td>
              <td className="right num">{formatINR(Number(p.unit_price))}</td>
              <td className="right num">{p.quantity_on_hand}</td>
              <td><StockBadge product={p} /></td>
              <td>
                <div className="row-actions">
                  {p.is_active ? <>
                    <button className="btn btn-subtle btn-icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil size={16} aria-hidden="true" /></button>
                    <button className="btn btn-subtle btn-icon" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}><Trash2 size={16} aria-hidden="true" /></button>
                  </> : <button className="btn btn-subtle btn-sm" onClick={() => restore(p)}><ArchiveRestore size={16} aria-hidden="true" />Restore</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <PageHeader title="Products" description="Your catalogue, pricing and reorder thresholds.">
        <button className="btn btn-primary" onClick={openAdd}><Plus size={18} aria-hidden="true" />Add product</button>
      </PageHeader>

      <section className="panel">
        <div className="filters">
          <label className="search">
            <span className="visually-hidden">Search products</span>
            <Search size={16} aria-hidden="true" />
            <input className="input" type="search" placeholder="Search name or SKU" value={filters.search} maxLength={120} onChange={setFilter("search")} />
          </label>
          <label>
            <span className="visually-hidden">Category</span>
            <select className="input" value={filters.category} onChange={setFilter("category")}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            <span className="visually-hidden">Stock status</span>
            <select className="input" value={filters.stock_status} onChange={setFilter("stock_status")}>
              <option value="">Any stock level</option>
              <option value="in_stock">In stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={filters.include_archived} onChange={setFilter("include_archived")} />Show archived</label>
        </div>
        {body}
      </section>

      {(adding || editing) && <ProductForm product={editing} categories={categories} onClose={closeForm} onSaved={() => { closeForm(); reload(); }} />}
      {deleting && <DeleteDialog product={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); reload(); }} />}
    </>
  );
}
