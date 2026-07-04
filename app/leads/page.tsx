"use client";

import { useEffect, useState } from "react";
import { supabase, type Lead } from "@/lib/supabase";

const SERVICE_OPTIONS = [
  "Closed-cell spray foam",
  "Open-cell spray foam",
  "SPF roofing",
  "Roof coating",
  "Concrete lifting",
  "Void filling",
  "Soil stabilization",
  "Polyurea coating",
  "Not sure",
];

const LEAD_SOURCES = [
  "Google Search",
  "Google Business Profile",
  "Facebook",
  "Referral",
  "Door hanger",
  "Job site sign",
  "Repeat customer",
  "Other",
];

type NewLead = {
  first_name: string;
  last_name: string;
  company_name: string;
  phone: string;
  email: string;
  lead_source: string;
  service_interest: string;
  property_address: string;
  city: string;
  state: string;
  square_feet: string;
  notes: string;
};

const blank: NewLead = {
  first_name: "", last_name: "", company_name: "", phone: "", email: "",
  lead_source: "", service_interest: "", property_address: "", city: "",
  state: "MT", square_feet: "", notes: "",
};

const STATUS_BADGE: Record<string, string> = {
  new: "badge-orange",
  contacted: "badge-yellow",
  qualified: "badge-green",
  lost: "badge-gray",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewLead>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchLeads() {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    setLeads(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchLeads(); }, []);

  function setField(key: keyof NewLead, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!form.first_name.trim() && !form.phone.trim()) {
      setError("Name or phone is required.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("leads").insert({
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      company_name: form.company_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      lead_source: form.lead_source || null,
      service_interest: form.service_interest || null,
      property_address: form.property_address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      square_feet: form.square_feet ? parseFloat(form.square_feet) : null,
      notes: form.notes.trim() || null,
      status: "new",
    });
    setSaving(false);
    if (err) { setError("Save failed: " + err.message); return; }
    setShowForm(false);
    setForm(blank);
    fetchLeads();
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from("leads").update({ status }).eq("id", id);
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
  }

  function displayName(l: Lead) {
    if (l.company_name) return l.company_name;
    return [l.first_name, l.last_name].filter(Boolean).join(" ") || "—";
  }

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Leads</h1>
            <p>Capture and qualify incoming leads</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
            + New lead
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2>New lead intake</h2>
          <div className="form-grid">
            <div className="field">
              <label>First name</label>
              <input value={form.first_name} onChange={(e) => setField("first_name", e.target.value)} placeholder="John" />
            </div>
            <div className="field">
              <label>Last name</label>
              <input value={form.last_name} onChange={(e) => setField("last_name", e.target.value)} placeholder="Smith" />
            </div>
            <div className="field">
              <label>Company (if commercial)</label>
              <input value={form.company_name} onChange={(e) => setField("company_name", e.target.value)} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="(406) 555-0100" type="tel" />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={form.email} onChange={(e) => setField("email", e.target.value)} type="email" />
            </div>
            <div className="field">
              <label>Lead source</label>
              <select value={form.lead_source} onChange={(e) => setField("lead_source", e.target.value)}>
                <option value="">— Select —</option>
                {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Service needed</label>
              <select value={form.service_interest} onChange={(e) => setField("service_interest", e.target.value)}>
                <option value="">— Select —</option>
                {SERVICE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Approx. sq ft</label>
              <input value={form.square_feet} onChange={(e) => setField("square_feet", e.target.value)} type="number" min={0} />
            </div>
            <div className="field">
              <label>Property address</label>
              <input value={form.property_address} onChange={(e) => setField("property_address", e.target.value)} placeholder="123 Main St" />
            </div>
            <div className="field">
              <label>City</label>
              <input value={form.city} onChange={(e) => setField("city", e.target.value)} placeholder="Billings" />
            </div>
            <div className="field">
              <label>State</label>
              <input value={form.state} onChange={(e) => setField("state", e.target.value)} placeholder="MT" maxLength={2} />
            </div>
          </div>
          <div className="field mt-4" style={{ gridColumn: "1 / -1" }}>
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Access conditions, urgency, budget, competing bids..." />
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
          <div className="flex gap-3 mt-6">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save lead"}
            </button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setForm(blank); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>All leads ({leads.length})</h2>
        {loading ? <p className="text-muted">Loading...</p> : leads.length === 0 ? (
          <div className="empty-state">No leads yet. Capture your first one above.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Service</th>
                  <th>City</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{displayName(l)}</td>
                    <td>{l.phone ? <a href={`tel:${l.phone}`} style={{ color: "var(--accent)" }}>{l.phone}</a> : "—"}</td>
                    <td>{l.service_interest ?? "—"}</td>
                    <td>{[l.city, l.state].filter(Boolean).join(", ") || "—"}</td>
                    <td>{l.lead_source ?? "—"}</td>
                    <td>
                      <select
                        value={l.status}
                        onChange={(e) => updateStatus(l.id, e.target.value)}
                        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="qualified">Qualified</option>
                        <option value="lost">Lost</option>
                      </select>
                    </td>
                    <td className="text-muted">
                      {new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
