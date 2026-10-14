import { useState } from "react";
import { useStore } from "../demoData.js";
import { DemoBanner, Field, PageHeader, useToast } from "../ui.jsx";

export default function Settings() {
  const { settings, update } = useStore();
  const toast = useToast();
  const [name, setName] = useState(settings.business_name);
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setError("Business name is required.");
    if (clean.length > 80) return setError("Use 80 characters or fewer.");
    setError("");
    update("settings", (s) => ({ ...s, business_name: clean }));
    toast("Settings saved (demo only)");
  };

  return (
    <>
      <PageHeader title="Settings" description="Basic workspace preferences." />
      <DemoBanner />
      <form className="panel" onSubmit={submit} noValidate style={{ maxWidth: 640 }}>
        <div className="panel-head"><h2>Business</h2></div>
        <div className="panel-body form-grid">
          <Field label="Business display name" error={error} className="full" hint="Shown in the sidebar.">
            {(p) => <input className="input" {...p} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Currency" hint="Fixed to Indian Rupee in version one.">{(p) => <input className="input" {...p} value="INR (₹)" readOnly />}</Field>
        </div>
        <div className="dialog-foot">
          <button type="submit" className="btn btn-primary" disabled={name.trim() === settings.business_name}>Save settings</button>
        </div>
      </form>
    </>
  );
}
