"use client";

import { useEffect, useState } from "react";
import { supabase, type Project } from "@/lib/supabase";
import { formatJoinedCustomerName, type CustomerSummary } from "@/lib/display";

type ProjectWithCustomer = Project & {
  customers: CustomerSummary | CustomerSummary[] | null;
};

type NewProject = {
  project_name: string;
  customer_search: string;
  customer_id: string;
  status: string;
  scheduled_date: string;
  crew_lead: string;
  crew_notes: string;
  internal_notes: string;
};

const blank: NewProject = {
  project_name: "", customer_search: "", customer_id: "",
  status: "scheduled", scheduled_date: "", crew_lead: "",
  crew_notes: "", internal_notes: "",
};

const STATUS_COLUMNS = [
  { key: "scheduled", label: "Scheduled", color: "badge-yellow" },
  { key: "in_progress", label: "In progress", color: "badge-orange" },
  { key: "complete", label: "Complete", color: "badge-green" },
  { key: "on_hold", label: "On hold", color: "badge-gray" },
];

function customerName(p: ProjectWithCustomer) {
  return formatJoinedCustomerName(p.customers);
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewProject>(blank);
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"board" | "list">("board");

  async function fetchProjects() {
    setLoading(true);
    const { data } = await supabase
      .from("projects")
      .select("*, customers(first_name, last_name, company_name)")
      .order("scheduled_date", { ascending: true, nullsFirst: false });
    setProjects(((data ?? []) as unknown as ProjectWithCustomer[]));
    setLoading(false);
  }

  useEffect(() => { fetchProjects(); }, []);

  async function searchCustomers(q: string) {
    if (!q.trim()) { setCustomerResults([]); return; }
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_name.ilike.%${q}%`)
      .limit(5);
    setCustomerResults(
      (data ?? []).map((c: { id: string; first_name: string | null; last_name: string | null; company_name: string | null }) => ({
        id: c.id,
        name: (c.company_name ?? [c.first_name, c.last_name].filter(Boolean).join(" ")) || c.id,
      }))
    );
  }

  function setField(key: keyof NewProject, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!form.project_name.trim()) { setError("Project name is required."); return; }
    if (!form.customer_id) { setError("Select a customer."); return; }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("projects").insert({
      project_name: form.project_name.trim(),
      customer_id: form.customer_id,
      status: form.status,
      scheduled_date: form.scheduled_date || null,
      crew_lead: form.crew_lead.trim() || null,
      crew_notes: form.crew_notes.trim() || null,
      internal_notes: form.internal_notes.trim() || null,
    });
    setSaving(false);
    if (err) { setError("Save failed: " + err.message); return; }
    setShowForm(false);
    setForm(blank);
    setCustomerResults([]);
    fetchProjects();
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from("projects").update({ status }).eq("id", id);
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
  }

  const byStatus = (status: string) => projects.filter((p) => p.status === status);

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Projects</h1>
            <p>Job scheduling and status tracking</p>
          </div>
          <div className="flex gap-3">
            <button className={`btn ${view === "board" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("board")}>Board</button>
            <button className={`btn ${view === "list" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("list")}>List</button>
            <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>+ New project</button>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2>New project</h2>
          <div className="form-grid">
            <div className="field">
              <label>Project name</label>
              <input value={form.project_name} onChange={(e) => setField("project_name", e.target.value)} placeholder="Crawl space foam — Smith" />
            </div>
            <div className="field" style={{ position: "relative" }}>
              <label>Customer</label>
              <input
                value={form.customer_search}
                onChange={(e) => { setField("customer_search", e.target.value); setField("customer_id", ""); searchCustomers(e.target.value); }}
                placeholder="Search customer name..."
              />
              {customerResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, zIndex: 20, marginTop: 2 }}>
                  {customerResults.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => { setField("customer_id", c.id); setField("customer_search", c.name); setCustomerResults([]); }}
                      style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setField("status", e.target.value)}>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In progress</option>
                <option value="complete">Complete</option>
                <option value="on_hold">On hold</option>
              </select>
            </div>
            <div className="field">
              <label>Scheduled date</label>
              <input type="date" value={form.scheduled_date} onChange={(e) => setField("scheduled_date", e.target.value)} />
            </div>
            <div className="field">
              <label>Crew lead</label>
              <input value={form.crew_lead} onChange={(e) => setField("crew_lead", e.target.value)} placeholder="Name" />
            </div>
            <div className="field">
              <label>Crew notes</label>
              <input value={form.crew_notes} onChange={(e) => setField("crew_notes", e.target.value)} placeholder="Equipment, access, special instructions..." />
            </div>
            <div className="field">
              <label>Internal notes</label>
              <input value={form.internal_notes} onChange={(e) => setField("internal_notes", e.target.value)} />
            </div>
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
          <div className="flex gap-3 mt-6">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save project"}</button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setForm(blank); setCustomerResults([]); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <p className="text-muted">Loading...</p> : view === "board" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {STATUS_COLUMNS.map((col) => (
            <div key={col.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span className={`badge ${col.color}`}>{col.label}</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>({byStatus(col.key).length})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {byStatus(col.key).length === 0 ? (
                  <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: 16, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
                    None
                  </div>
                ) : byStatus(col.key).map((p) => (
                  <div key={p.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.project_name}</div>
                      {p.source_lead_id && <span className="badge badge-gray">📋 From lead</span>}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>{customerName(p)}</div>
                    {p.scheduled_date && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                        📅 {new Date(p.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    )}
                    {p.crew_lead && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>👷 {p.crew_lead}</div>}
                    <div style={{ marginTop: 10 }}>
                      <select
                        value={p.status}
                        onChange={(e) => updateStatus(p.id, e.target.value)}
                        style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="in_progress">In progress</option>
                        <option value="complete">Complete</option>
                        <option value="on_hold">On hold</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          {projects.length === 0 ? (
            <div className="empty-state">No projects yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Crew lead</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontWeight: 600 }}>
                          <span>{p.project_name}</span>
                          {p.source_lead_id && <span className="badge badge-gray">📋 From lead</span>}
                        </div>
                      </td>
                      <td>{customerName(p)}</td>
                      <td>
                        <select
                          value={p.status}
                          onChange={(e) => updateStatus(p.id, e.target.value)}
                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="in_progress">In progress</option>
                          <option value="complete">Complete</option>
                          <option value="on_hold">On hold</option>
                        </select>
                      </td>
                      <td>{p.scheduled_date ? new Date(p.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                      <td>{p.crew_lead ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
