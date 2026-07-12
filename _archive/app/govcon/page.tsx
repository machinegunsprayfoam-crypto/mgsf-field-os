"use client";

import { useEffect, useState } from "react";
import { supabase, type GovconDoc, type GovconOpportunity } from "@/lib/supabase";

const DOC_TYPES = [
  "SAM Registration",
  "UEI Number",
  "DUNS Number",
  "Capability Statement",
  "Past Performance",
  "NAICS Codes",
  "PSC Codes",
  "Small Business Cert",
  "Insurance Certificate",
  "Bond",
  "W-9",
  "Other",
];

const OPP_STATUSES = ["watching", "pursuing", "bid_submitted", "awarded", "not_awarded", "no_bid"];

type NewDoc = {
  doc_type: string;
  title: string;
  content: string;
  status: string;
  expiration_date: string;
  file_url: string;
  notes: string;
};

type NewOpp = {
  title: string;
  solicitation_number: string;
  agency: string;
  naics_code: string;
  psc_code: string;
  posted_date: string;
  due_date: string;
  estimated_value: string;
  status: string;
  source_url: string;
  notes: string;
};

const blankDoc: NewDoc = {
  doc_type: "SAM Registration", title: "", content: "", status: "current",
  expiration_date: "", file_url: "", notes: "",
};

const blankOpp: NewOpp = {
  title: "", solicitation_number: "", agency: "", naics_code: "",
  psc_code: "", posted_date: "", due_date: "", estimated_value: "",
  status: "watching", source_url: "", notes: "",
};

const OPP_BADGE: Record<string, string> = {
  watching: "badge-gray",
  pursuing: "badge-yellow",
  bid_submitted: "badge-orange",
  awarded: "badge-green",
  not_awarded: "badge-gray",
  no_bid: "badge-gray",
};

export default function GovconPage() {
  const [docs, setDocs] = useState<GovconDoc[]>([]);
  const [opps, setOpps] = useState<GovconOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDocForm, setShowDocForm] = useState(false);
  const [showOppForm, setShowOppForm] = useState(false);
  const [docForm, setDocForm] = useState<NewDoc>(blankDoc);
  const [oppForm, setOppForm] = useState<NewOpp>(blankOpp);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"readiness" | "opportunities">("readiness");

  async function fetchAll() {
    setLoading(true);
    const [{ data: d }, { data: o }] = await Promise.all([
      supabase.from("govcon_docs").select("*").order("doc_type"),
      supabase.from("govcon_opportunities").select("*").order("due_date", { ascending: true }),
    ]);
    setDocs(d ?? []);
    setOpps(o ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function saveDoc() {
    if (!docForm.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const { error: err } = await supabase.from("govcon_docs").insert({
      doc_type: docForm.doc_type,
      title: docForm.title.trim(),
      content: docForm.content.trim() || null,
      status: docForm.status,
      expiration_date: docForm.expiration_date || null,
      file_url: docForm.file_url.trim() || null,
      notes: docForm.notes.trim() || null,
    });
    setSaving(false);
    if (err) { setError("Save failed: " + err.message); return; }
    setShowDocForm(false); setDocForm(blankDoc); fetchAll();
  }

  async function saveOpp() {
    if (!oppForm.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const { error: err } = await supabase.from("govcon_opportunities").insert({
      title: oppForm.title.trim(),
      solicitation_number: oppForm.solicitation_number.trim() || null,
      agency: oppForm.agency.trim() || null,
      naics_code: oppForm.naics_code.trim() || null,
      psc_code: oppForm.psc_code.trim() || null,
      posted_date: oppForm.posted_date || null,
      due_date: oppForm.due_date || null,
      estimated_value: oppForm.estimated_value ? parseFloat(oppForm.estimated_value) : null,
      status: oppForm.status,
      source_url: oppForm.source_url.trim() || null,
      notes: oppForm.notes.trim() || null,
    });
    setSaving(false);
    if (err) { setError("Save failed: " + err.message); return; }
    setShowOppForm(false); setOppForm(blankOpp); fetchAll();
  }

  async function updateOppStatus(id: string, status: string) {
    await supabase.from("govcon_opportunities").update({ status }).eq("id", id);
    setOpps((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
  }

  const expiringDocs = docs.filter((d) => {
    if (!d.expiration_date) return false;
    const days = (new Date(d.expiration_date).getTime() - Date.now()) / 86400000;
    return days <= 60;
  });

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Government Contracting</h1>
            <p>SAM readiness, capability statements, and federal opportunities</p>
          </div>
          <div className="flex gap-3">
            <button className={`btn ${tab === "readiness" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("readiness")}>Readiness docs</button>
            <button className={`btn ${tab === "opportunities" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("opportunities")}>Opportunities</button>
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Readiness docs</div>
          <div className="value">{loading ? "—" : docs.length}</div>
          <div className="sub">In system</div>
        </div>
        <div className="stat-card">
          <div className="label">Expiring soon</div>
          <div className="value" style={{ color: expiringDocs.length > 0 ? "var(--danger)" : "var(--text)" }}>
            {loading ? "—" : expiringDocs.length}
          </div>
          <div className="sub">Within 60 days</div>
        </div>
        <div className="stat-card">
          <div className="label">Opportunities</div>
          <div className="value">{loading ? "—" : opps.length}</div>
          <div className="sub">Tracked</div>
        </div>
        <div className="stat-card">
          <div className="label">Pursuing</div>
          <div className="value">{loading ? "—" : opps.filter((o) => o.status === "pursuing" || o.status === "bid_submitted").length}</div>
          <div className="sub">Active bids</div>
        </div>
      </div>

      {/* Readiness docs tab */}
      {tab === "readiness" && (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div />
            <button className="btn btn-primary" onClick={() => { setShowDocForm(true); setError(""); }}>+ Add document</button>
          </div>

          {showDocForm && (
            <div className="card">
              <h2>Add readiness document</h2>
              <div className="form-grid">
                <div className="field">
                  <label>Document type</label>
                  <select value={docForm.doc_type} onChange={(e) => setDocForm((p) => ({ ...p, doc_type: e.target.value }))}>
                    {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Title / label *</label>
                  <input value={docForm.title} onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))} placeholder="SAM.gov Registration — Active" />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={docForm.status} onChange={(e) => setDocForm((p) => ({ ...p, status: e.target.value }))}>
                    <option value="current">Current</option>
                    <option value="expired">Expired</option>
                    <option value="pending">Pending</option>
                    <option value="not_started">Not started</option>
                  </select>
                </div>
                <div className="field">
                  <label>Expiration date</label>
                  <input type="date" value={docForm.expiration_date} onChange={(e) => setDocForm((p) => ({ ...p, expiration_date: e.target.value }))} />
                </div>
                <div className="field">
                  <label>File / Drive URL</label>
                  <input value={docForm.file_url} onChange={(e) => setDocForm((p) => ({ ...p, file_url: e.target.value }))} placeholder="https://drive.google.com/..." />
                </div>
              </div>
              <div className="field mt-4">
                <label>Content / notes</label>
                <textarea value={docForm.content} onChange={(e) => setDocForm((p) => ({ ...p, content: e.target.value }))} placeholder="UEI: XXXXXXXX, CAGE: XXXXX, SAM expires MM/YYYY..." rows={4} />
              </div>
              {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
              <div className="flex gap-3 mt-6">
                <button className="btn btn-primary" onClick={saveDoc} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                <button className="btn btn-ghost" onClick={() => { setShowDocForm(false); setDocForm(blankDoc); setError(""); }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="card">
            <h2>Readiness documents ({docs.length})</h2>
            {loading ? <p className="text-muted">Loading...</p> : docs.length === 0 ? (
              <div className="empty-state">No documents yet. Add SAM registration, capability statement, NAICS codes, and other readiness docs.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Expires</th>
                      <th>Link</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => {
                      const daysToExp = d.expiration_date
                        ? Math.round((new Date(d.expiration_date).getTime() - Date.now()) / 86400000)
                        : null;
                      return (
                        <tr key={d.id}>
                          <td><span className="badge badge-gray">{d.doc_type}</span></td>
                          <td style={{ fontWeight: 600 }}>{d.title}</td>
                          <td>
                            <span className={`badge ${d.status === "current" ? "badge-green" : d.status === "pending" ? "badge-yellow" : "badge-gray"}`}>
                              {d.status}
                            </span>
                          </td>
                          <td>
                            {daysToExp !== null ? (
                              <span style={{ color: daysToExp <= 0 ? "var(--danger)" : daysToExp <= 30 ? "var(--warning)" : "var(--text-muted)", fontSize: 13 }}>
                                {new Date(d.expiration_date! + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                {daysToExp <= 60 && ` (${daysToExp <= 0 ? "expired" : daysToExp + "d left"})`}
                              </span>
                            ) : "—"}
                          </td>
                          <td>
                            {d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 13 }}>Open ↗</a> : "—"}
                          </td>
                          <td className="text-muted" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {d.content ?? d.notes ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Opportunities tab */}
      {tab === "opportunities" && (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div />
            <button className="btn btn-primary" onClick={() => { setShowOppForm(true); setError(""); }}>+ Add opportunity</button>
          </div>

          {showOppForm && (
            <div className="card">
              <h2>Track opportunity</h2>
              <div className="form-grid">
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Title *</label>
                  <input value={oppForm.title} onChange={(e) => setOppForm((p) => ({ ...p, title: e.target.value }))} placeholder="Spray foam insulation — Fort Harrison, MT" />
                </div>
                <div className="field">
                  <label>Solicitation #</label>
                  <input value={oppForm.solicitation_number} onChange={(e) => setOppForm((p) => ({ ...p, solicitation_number: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Agency</label>
                  <input value={oppForm.agency} onChange={(e) => setOppForm((p) => ({ ...p, agency: e.target.value }))} placeholder="US Army Corps of Engineers" />
                </div>
                <div className="field">
                  <label>NAICS code</label>
                  <input value={oppForm.naics_code} onChange={(e) => setOppForm((p) => ({ ...p, naics_code: e.target.value }))} placeholder="238290" />
                </div>
                <div className="field">
                  <label>PSC code</label>
                  <input value={oppForm.psc_code} onChange={(e) => setOppForm((p) => ({ ...p, psc_code: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Posted date</label>
                  <input type="date" value={oppForm.posted_date} onChange={(e) => setOppForm((p) => ({ ...p, posted_date: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Due date</label>
                  <input type="date" value={oppForm.due_date} onChange={(e) => setOppForm((p) => ({ ...p, due_date: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Estimated value ($)</label>
                  <input type="number" min={0} value={oppForm.estimated_value} onChange={(e) => setOppForm((p) => ({ ...p, estimated_value: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={oppForm.status} onChange={(e) => setOppForm((p) => ({ ...p, status: e.target.value }))}>
                    {OPP_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>SAM.gov / source URL</label>
                  <input value={oppForm.source_url} onChange={(e) => setOppForm((p) => ({ ...p, source_url: e.target.value }))} placeholder="https://sam.gov/..." />
                </div>
              </div>
              <div className="field mt-4">
                <label>Notes</label>
                <textarea value={oppForm.notes} onChange={(e) => setOppForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Set-aside type, bonding requirements, teaming..." />
              </div>
              {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
              <div className="flex gap-3 mt-6">
                <button className="btn btn-primary" onClick={saveOpp} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                <button className="btn btn-ghost" onClick={() => { setShowOppForm(false); setOppForm(blankOpp); setError(""); }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="card">
            <h2>Tracked opportunities ({opps.length})</h2>
            {loading ? <p className="text-muted">Loading...</p> : opps.length === 0 ? (
              <div className="empty-state">No opportunities tracked yet. Find bids on SAM.gov, DIBBS, or state procurement portals.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Agency</th>
                      <th>NAICS</th>
                      <th>Due</th>
                      <th>Est. value</th>
                      <th>Status</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opps.map((o) => {
                      const daysToDue = o.due_date
                        ? Math.round((new Date(o.due_date).getTime() - Date.now()) / 86400000)
                        : null;
                      return (
                        <tr key={o.id}>
                          <td style={{ fontWeight: 600, maxWidth: 220 }}>{o.title}</td>
                          <td className="text-muted">{o.agency ?? "—"}</td>
                          <td className="text-muted">{o.naics_code ?? "—"}</td>
                          <td>
                            {daysToDue !== null ? (
                              <span style={{ color: daysToDue <= 7 ? "var(--danger)" : daysToDue <= 21 ? "var(--warning)" : "var(--text-muted)", fontSize: 13 }}>
                                {new Date(o.due_date! + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                {daysToDue <= 21 && ` (${daysToDue}d)`}
                              </span>
                            ) : "—"}
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {o.estimated_value ? "$" + o.estimated_value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
                          </td>
                          <td>
                            <select
                              value={o.status}
                              onChange={(e) => updateOppStatus(o.id, e.target.value)}
                              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                            >
                              {OPP_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                            </select>
                          </td>
                          <td>
                            {o.source_url ? <a href={o.source_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 13 }}>SAM.gov ↗</a> : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
