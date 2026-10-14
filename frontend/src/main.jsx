import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { MapPinOff } from "lucide-react";
import "@fontsource-variable/inter";
import "./styles.css";
import Layout from "./Layout.jsx";
import { EmptyState, ToastProvider } from "./ui.jsx";
import Overview from "./pages/Overview.jsx";
import Products from "./pages/Products.jsx";
import Inventory from "./pages/Inventory.jsx";
import Orders from "./pages/Orders.jsx";
import Reports from "./pages/Reports.jsx";
import Settings from "./pages/Settings.jsx";

const NotFound = () => (
  <EmptyState
    icon={MapPinOff}
    title="Page not found"
    text="This page does not exist."
    action={<Link className="btn btn-secondary" to="/">Go to Overview</Link>}
  />
);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="products" element={<Products />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="orders" element={<Orders />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>
);
