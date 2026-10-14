import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { Boxes, ChartColumn, LayoutDashboard, Menu, Package, Settings, ShoppingCart, Warehouse, X } from "lucide-react";
import { useStore } from "./demoData.js";

const NAV = [
  ["/", "Overview", LayoutDashboard],
  ["/products", "Products", Package],
  ["/inventory", "Inventory", Warehouse],
  ["/orders", "Orders", ShoppingCart],
  ["/reports", "Reports", ChartColumn],
  ["/settings", "Settings", Settings],
];

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><Boxes size={18} aria-hidden="true" /></span>
      StockFlow
    </div>
  );
}

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const { settings } = useStore();

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <button
          className="btn btn-subtle btn-icon"
          style={{ color: "var(--white)" }}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </header>

      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside id="sidebar" className={`sidebar ${menuOpen ? "open" : ""}`}>
        <Brand />
        <nav className="nav" aria-label="Main">
          <span className="nav-label">Workspace</span>
          {NAV.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <strong>{settings.business_name}</strong>
          Admin workspace
        </div>
      </aside>

      <main className="main" id="main">
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
