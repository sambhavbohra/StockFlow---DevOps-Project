import { useState } from "react";
import { useSearchParams } from "react-router";
import { Archive, ArchiveRestore, Package, PackagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { formatINR, stockStatus, useStore } from "../demoData.js";
import { DemoBanner, Dialog, EmptyState, Field, PageHeader, StockBadge, useToast } from "../ui.jsx";

const EMPTY = { name: "", sku: "", category: "General", unit_price: "", quantity_on_hand: "0", reorder_threshold: "10", description: "" };
const isWhole = (v) => /^\d+$/.test(String(v).trim());

// Client-side checks for fast feedback; the backend re-validates everything from Phase 3.
function validate(form, products, editingId) {
  const e = {};
  if (!form.name.trim()) e.name = "Product name is required.";
  if (!form.sku.trim()) e.sku = "SKU is required.";
  else if (products.some((p) => p.id !== editingId && p.sku.toUpperCase() === form.sku.trim().toUpperCase())) e.sku = "This SKU is already used by another product.";
  if (!form.category.trim()) e.category = "Category is required.";
  if (form.unit_price === "" || Number.isNaN(Number(form.unit_price)) || Number(form.unit_price) < 0) e.unit_price = "Enter a price of 0 or more.";
  if (!editingId && !isWhole(form.quantity_on_hand)) e.quantity_on_hand = "Enter a whole number of 0 or more.";
  if (!isWhole(form.reorder_threshold)) e.reorder_threshold = "Enter a whole number of 0 or more.";
  return e;
}

function ProductForm({ product, onClose }) {
  const { products, update } = useStore();
  const toast = useToast();
  const [form, setForm] = useState(product ? { ...EMPTY, ...product, unit_price: String(product.unit_price), reorder_threshold: String(product.reorder_threshold) } : EMPTY);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const categories = [...new Set(products.map((p) => p.category))];

  const submit = (e) => {
    e.preventDefault();
    const errs = validate(form, products, product?.id);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const clean = {
      name: form.name.trim(), sku: form.sku.trim().toUpperCase(), category: form.category.trim(),
      unit_price: Number(form.unit_price), reorder_threshold: Number(form.reorder_threshold), description: form.description.trim(),
    };
    if (product) update("products", (ps) => ps.map((p) => (p.id === product.id ? { ...p, ...clean } : p)));
    else update("products", (ps) => [...ps, { ...clean, id: Math.max(0, ...ps.map((p) => p.id)) + 1, quantity_on_hand: Number(form.quantity_on_hand), is_active: true }]);
    toast(`${clean.name} ${product ? "updated" : "added"} (demo only)`);
    onClose();
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
        <button type="submit" form="product-form" className="btn btn-primary">Save product</button>
      </>}
    >
      <form id="product-form" className="form-grid" onSubmit={submit} noValidate>
        <span className="form-section">Identity</span>
        <Field label="Product name" error={errors.name}>{(p) => <input className="input" {...p} value={form.name} onChange={set("name")} />}</Field>
        <Field label="SKU" error={errors.sku} hint="Unique; stored in upper case.">{(p) => <input className="input mono" {...p} value={form.sku} onChange={set("sku")} />}</Field>
        <Field label="Category" error={errors.category} className="full">
          {(p) => <>
            <input className="input" list="categories" {...p} value={form.category} onChange={set("category")} />
            <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </>}
        </Field>
        <span className="form-section">Pricing and stock</span>
        <Field label="Unit price (₹)" error={errors.unit_price}>{(p) => <input className="input num" inputMode="decimal" {...p} value={form.unit_price} onChange={set("unit_price")} />}</Field>
        {product ? (
          <Field label="Quantity on hand" hint="Change stock from Inventory so every change is recorded.">{(p) => <input className="input num" {...p} value={product.quantity_on_hand} readOnly />}</Field>
        ) : (
          <Field label="Initial quantity" error={errors.quantity_on_hand}>{(p) => <input className="input num" inputMode="numeric" {...p} value={form.quantity_on_hand} onChange={set("quantity_on_hand")} />}</Field>
        )}
        <Field label="Reorder threshold" error={errors.reorder_threshold} hint="Low stock at or below this quantity.">{(p) => <input className="input num" inputMode="numeric" {...p} value={form.reorder_threshold} onChange={set("reorder_threshold")} />}</Field>
        <Field label="Description (optional)" className="full">{(p) => <textarea className="input" {...p} value={form.description} onChange={set("description")} />}</Field>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ product, onClose }) {
  const { movements, orders, update } = useStore();
  const toast = useToast();
  // Mirrors the API rule: DELETE returns 409 when the product has history (docs/05-backend-schema.md §4).
  const hasHistory = movements.some((m) => m.product_id === product.id) || orders.some((o) => o.items.some((i) => i.product_id === product.id));
  const remove = () => { update("products", (ps) => ps.filter((p) => p.id !== product.id)); toast(`${product.name} deleted (demo only)`); onClose(); };
  const archive = () => { update("products", (ps) => ps.map((p) => (p.id === product.id ? { ...p, is_active: false } : p))); toast(`${product.name} archived (demo only)`); onClose(); };
  return (
    <Dialog
      open
      onClose={onClose}
      icon={hasHistory ? Archive : Trash2}
      title={hasHistory ? "This product has history" : `Delete ${product.name}?`}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {hasHistory
          ? <button className="btn btn-primary" onClick={archive}><Archive size={16} aria-hidden="true" />Archive product</button>
          : <button className="btn btn-danger-solid" onClick={remove}><Trash2 size={16} aria-hidden="true" />Delete product</button>}
      </>}
    >
      <p>
        {hasHistory
          ? `${product.name} has stock movements or orders, so it can't be deleted without losing history. Archive it instead: it disappears from lists and new orders, and you can restore it later.`
          : `${product.name} (${product.sku}) will be permanently removed. This cannot be undone.`}
      </p>
    </Dialog>
  );
}

export default function Products() {
  const { products, update } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const adding = params.get("new") === "1";

  const categories = [...new Set(products.map((p) => p.category))].sort();
  const q = query.trim().toLowerCase();
  const rows = products.filter((p) =>
    (showArchived || p.is_active) &&
    (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) &&
    (!category || p.category === category) &&
    (!status || stockStatus(p) === status));
  const clearFilters = () => { setQuery(""); setCategory(""); setStatus(""); setShowArchived(false); };
  const restore = (p) => { update("products", (ps) => ps.map((x) => (x.id === p.id ? { ...x, is_active: true } : x))); toast(`${p.name} restored (demo only)`); };

  return (
    <>
      <PageHeader title="Products" description="Your catalogue, pricing and reorder thresholds.">
        <button className="btn btn-primary" onClick={() => setParams({ new: "1" })}><Plus size={18} aria-hidden="true" />Add product</button>
      </PageHeader>
      <DemoBanner />

      <section className="panel">
        <div className="filters">
          <label className="search">
            <span className="visually-hidden">Search products</span>
            <Search size={16} aria-hidden="true" />
            <input className="input" type="search" placeholder="Search name or SKU" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label>
            <span className="visually-hidden">Category</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            <span className="visually-hidden">Stock status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any stock level</option>
              <option value="in">In stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label>
        </div>

        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Category</th><th className="right">Price</th><th className="right">Qty</th><th>Status</th><th className="right"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="identity"><strong>{p.name}</strong><span className="mono">{p.sku}</span></td>
                    <td>{p.category}</td>
                    <td className="right num">{formatINR(p.unit_price)}</td>
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
        ) : products.length ? (
          <EmptyState icon={Search} title="No products match these filters" action={<button className="btn btn-secondary" onClick={clearFilters}>Clear filters</button>} />
        ) : (
          <EmptyState icon={Package} title="No products yet" text="Add your first product to start tracking stock." action={<button className="btn btn-primary" onClick={() => setParams({ new: "1" })}>Add product</button>} />
        )}
      </section>

      {(adding || editing) && <ProductForm product={editing} onClose={() => { setEditing(null); setParams({}); }} />}
      {deleting && <DeleteDialog product={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
