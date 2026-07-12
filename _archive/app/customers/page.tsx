"use client";

import { useEffect, useState } from "react";
import { supabase, type Customer } from "@/lib/supabase";

type NewCustomer = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  customer_type: string;
  company_name: string;
  lead_source: string;
  notes: string;
};

const blank: NewCustomer = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  customer_type: "residential",
  company_name: "",
  lead_source: "",
  notes: "",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewCustomer>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function fetchCustomers() {
    setLoading(true);
    const { data } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    setCustomers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchCustomers(); }, []);

  function setField(key: keyof NewCustomer, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.first_name.trim() && !form.company_name.trim()) {
      setError("First name or company name is required.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("customers").insert({
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      customer_type: form.customer_type,
      company_name: form.company_name.trim() || null,
      lead_source: form.lead_source.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError("Save failed: " + err.message);
    } else {
      setShowForm(false);
      setForm(blank);
      fetchCustomers();
    }
  }

  function displayName(c: Customer) {
    if (c.company_name) return c.company_name;
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
  }

  const filteredCustomers = search.trim()
    ? customers.filter((c) => {
        const q = search.toLowerCase();
        return (
          displayName(c).toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.lead_source ?? "").toLowerCase().includes(q)
        );
      })
    : customers;

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Customers</h1>
            <p>All customers and leads</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
            + New customer
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2>Add customer</h2>
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
              <label>Company name</label>
              <input value={form.company_name} onChange={(e) => setField("company_name", e.target.value)} placeholder="Acme Corp" />
            </div>
            <div className="field">
              <label>Customer type</label>
              <select value={form.customer_type} onChange={(e) => setField("customer_type", e.target.value)}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="agricultural">Agricultural</option>
                <option value="industrial">Industrial</option>
                <option value="government">Government</option>
              </select>
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="(406) 555-0100" type="tel" />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="john@example.com" type="email" />
            </div>
            <div className="field">
              <label>Lead source</label>
              <input value={form.lead_source} onChange={(e) => setField("lead_source", e.target.value)} placeholder="Google, referral, etc." />
            </div>
            <div className="field">
              <label>Notes</label>
              <input value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Any notes..." />
            </div>
          </div>
          {error && <p className="text-muted mt-4" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex gap-3 mt-6">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save customer"}
            </button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setForm(blank); setError(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <h2>All customers ({filteredCustomers.length}{search ? " matching" : ""})</h2>
          <input
            type="search"
            placeholder="Search name, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)", fontSize: 14, padding: "7px 12px", minWidth: 220 }}
          />
        </div>
        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : filteredCustomers.length === 0 ? (
          <div className="empty-state">{search ? "No customers match your search." : "No customers yet. Add your first one above."}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Lead source</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{displayName(c)}</td>
                    <td>
                      <span className={`badge ${c.customer_type === "residential" ? "badge-gray" : "badge-orange"}`}>
                        {c.customer_type}
                      </span>
                    </td>
                    <td>{c.phone ?? "—"}</td>
                    <td>{c.email ?? "—"}</td>
                    <td>{c.lead_source ?? "—"}</td>
                    <td className="text-muted">
                      {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
