import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import {
  Archive, Ban, CircleAlert, CircleCheck, CircleX, Clock, PackageCheck, TriangleAlert, Truck, X,
} from "lucide-react";
import { stockStatus } from "./format.js";

export function PageHeader({ title, description, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

// Status treatments from docs/04-ui-ux-brief.md §6a: always text + icon, palette tones only.
const STOCK = {
  in: ["In stock", CircleCheck, "badge-plain"],
  low: ["Low stock", TriangleAlert, "badge-outline"],
  out: ["Out of stock", CircleX, "badge-caviar"],
};
const ORDER = {
  PENDING: ["Pending", Clock, "badge-outline-muted"],
  CONFIRMED: ["Confirmed", CircleCheck, "badge-saddle"],
  SHIPPED: ["Shipped", Truck, "badge-shadow"],
  DELIVERED: ["Delivered", PackageCheck, "badge-caviar"],
  CANCELLED: ["Cancelled", Ban, "badge-dashed"],
};

function Badge({ spec }) {
  const [label, Icon, cls] = spec;
  return (
    <span className={`badge ${cls}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}

export function StockBadge({ product }) {
  if (!product.is_active) return <Badge spec={["Archived", Archive, "badge-dashed"]} />;
  return <Badge spec={STOCK[stockStatus(product)]} />;
}

export const OrderBadge = ({ status }) => <Badge spec={ORDER[status]} />;
export const orderLabel = (status) => ORDER[status][0];

// Native <dialog>: focus trapping, Esc to close and the backdrop come from the browser.
export function Dialog({ open, onClose, title, description, icon: Icon, drawer, footer, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className={drawer ? "drawer" : undefined} aria-labelledby={titleId} onClose={onClose}>
      {open && (
        <div className="dialog-inner">
          <div className="dialog-head">
            {Icon && <span className="dialog-icon"><Icon size={20} aria-hidden="true" /></span>}
            <div className="grow">
              <h2 id={titleId}>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <button type="button" className="btn btn-subtle btn-icon" onClick={onClose} aria-label="Close dialog">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, error, hint, className, children }) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": error ? "true" : undefined, "aria-describedby": error ? errId : undefined })}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <span className="field-error" id={errId}>
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="state">
      <Icon size={32} aria-hidden="true" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <CircleAlert size={24} aria-hidden="true" />
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry && <button className="btn btn-secondary btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Skeleton({ rows = 4 }) {
  return (
    <div className="panel-body" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%`, marginBottom: 12 }} />
      ))}
    </div>
  );
}

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, kind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "error" ? "toast-error" : ""}`}>
            {t.kind === "error" ? <CircleAlert size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
