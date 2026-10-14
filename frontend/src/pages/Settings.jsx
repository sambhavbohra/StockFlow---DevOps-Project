import { useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import { api } from "../api.js";
import { Field, PageHeader, Skeleton, useToast } from "../ui.jsx";

export default function Settings() {
  const { settings, setSettings } = useOutletContext();
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (settings) setName(settings.business_name); }, [settings]);

  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setError("Business name is required.");
    setError("");
    setSaving(true);
    try {
      const saved = await api("/settings", { method: "PUT", body: { business_name: clean } });
      setSettings(saved);
      toast("Settings saved");
    } catch (err) {
      if (err.status === 422) setError(err.fields.business_name ?? err.message);
      else toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Basic workspace preferences." />
      <form className="panel" onSubmit={submit} noValidate style={{ maxWidth: 640 }}>
        <div className="panel-head"><h2>Business</h2></div>
        {!settings ? <Skeleton rows={2} /> : (
          <div className="panel-body form-grid">
            <Field label="Business display name" error={error} className="full" hint="Shown in the sidebar.">
              {(p) => <input className="input" {...p} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Currency" hint="Fixed to Indian Rupee in version one.">{(p) => <input className="input" {...p} value="INR (₹)" readOnly />}</Field>
          </div>
        )}
        <div className="dialog-foot">
          <button type="submit" className="btn btn-primary" disabled={!settings || saving || name.trim() === settings.business_name}>{saving ? "Saving…" : "Save settings"}</button>
        </div>
      </form>
    </>
  );
}
