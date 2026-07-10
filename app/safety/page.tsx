"use client";

import { useEffect, useState } from "react";
import { supabase, type SafetyIncident, type SafetyChecklist } from "@/lib/supabase";

const INCIDENT_TYPES = [
  "Slip / trip / fall",
  "Chemical exposure",
  "Equipment malfunction",
  "Cut / laceration",
  "Burn",
  "Respiratory",
  "Eye injury",
  "Vehicle",
  "Electrical",
  "Heat illness",
  "Near miss",
  "Property damage",
  "Other",
];

const SEVERITIES = ["near_miss", "first_aid", "medical", "lost_time", "fatality"];

const JOB_START_ITEMS = [
  "PPE inspected (suits, gloves, respirators, eye protection)",
  "Spray rig hoses and fittings checked",
  "Fire extinguisher present and charged",
  "MSDS/SDS sheets on site",
  "Work area barricaded and signed",
  "Ventilation plan in place",
  "Emergency contact numbers posted",
  "Crew briefed on job hazards",
  "No ignition sources within exclusion zone",
  "First aid kit on site",
];

type NewIncident = {
  incident_date: string;
  incident_type: string;
  severity: string;
  involved_person: string;
  description: string;
  corrective_action: string;
  reported_by: string;
  osha_recordable: boolean;
};

const blankIncident: NewIncident = {
  incident_date: new Date().toISOString().split("T")[0],
  incident_type: "Near miss",
  severity: "near_miss",
  involved_person: "",
  description: "",
  corrective_action: "",
  reported_by: "",
  osha_recordable: false,
};

const SEVERITY_BADGE: Record<string, string> = {
  near_miss: "badge-yellow",
  first_aid: "badge-orange",
  medical: "badge-orange",
  lost_time: "badge-orange",
  fatality: "badge-gray",
};

export default function SafetyPage() {
  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  const [checklists, setChecklists] = useState<SafetyChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"checklists" | "incidents">("checklists");
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentForm, setIncidentForm] = useState<NewIncident>(blankIncident);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Checklist state
  const [checkItems, setCheckItems] = useState<{ label: string; checked: boolean }[]>(
    JOB_START_ITEMS.map((label) => ({ label, checked: false }))
  );
  const [checklistBy, setChecklistBy] = useState("");
  const [checklistNotes, setChecklistNotes] = useState("");
  const [showChecklistForm, setShowChecklistForm] = useState(false);
  const [savingCL, setSavingCL] = useState(false);

  async function fetchAll() {
    setLoading(true);
    const [{ data: inc }, { data: cls }] = await Promise.all([
      supabase.from("safety_incidents").select("*").order("incident_date", { ascending: false }),
      supabase.from("safety_checklists").select("*").order("created_at", { ascending: false }),
    ]);
    setIncidents(inc ?? []);
    setChecklists(cls ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function saveIncident() {
    if (!incidentForm.description.trim()) { setError("Description is required."); return; }
    setSaving(true); setError("");
    const { error: err } = await supabase.from("safety_incidents").insert({
      incident_date: incidentForm.incident_date,
      incident_type: incidentForm.incident_type,
      severity: incidentForm.severity,
      involved_person: incidentForm.involved_person.trim() || null,
      description: incidentForm.description.trim(),
      corrective_action: incidentForm.corrective_action.trim() || null,
      reported_by: incidentForm.reported_by.trim() || null,
      osha_recordable: incidentForm.osha_recordable,
    });
    setSaving(false);
    if (err) { setError("Save failed: " + err.message); return; }
    setShowIncidentForm(false);
    setIncidentForm(blankIncident);
    fetchAll();
  }

  async function saveChecklist() {
    setSavingCL(true);
    const completedCount = checkItems.filter((i) => i.checked).length;
    const status = completedCount === checkItems.length ? "complete" : "partial";
    await supabase.from("safety_checklists").insert({
      checklist_type: "job_start",
      completed_by: checklistBy.trim() || null,
      completed_at: new Date().toISOString(),
      status,
      notes: checklistNotes.trim() || null,
      items: checkItems,
    });
    setSavingCL(false);
    setShowChecklistForm(false);
    setCheckItems(JOB_START_ITEMS.map((label) => ({ label, checked: false })));
    setChecklistBy("");
    setChecklistNotes("");
    fetchAll();
  }

  const oshRecordable = incidents.filter((i) => i.osha_recordable).length;
  const thisYear = new Date().getFullYear();
  const thisYearIncidents = incidents.filter((i) => new Date(i.incident_date).getFullYear() === thisYear).length;

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Safety & OSHA</h1>
            <p>Job-start checklists, incident reports, and compliance records</p>
          </div>
          <div className="flex gap-3">
            <button className={`btn ${tab === "checklists" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("checklists")}>Checklists</button>
            <button className={`btn ${tab === "incidents" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("incidents")}>Incidents</button>
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Checklists completed</div>
          <div className="value">{loading ? "—" : checklists.length}</div>
          <div className="sub">All time</div>
        </div>
        <div className="stat-card">
          <div className="label">Incidents this year</div>
          <div className="value" style={{ color: thisYearIncidents > 0 ? "var(--warning)" : "var(--success)" }}>
            {loading ? "—" : thisYearIncidents}
          </div>
          <div className="sub">{thisYear}</div>
        </div>
        <div className="stat-card">
          <div className="label">OSHA recordable</div>
          <div className="value" style={{ color: oshRecordable > 0 ? "var(--danger)" : "var(--success)" }}>
            {loading ? "—" : oshRecordable}
          </div>
          <div className="sub">All time</div>
        </div>
      </div>

      {/* Checklists tab */}
      {tab === "checklists" && (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div />
            <button className="btn btn-primary" onClick={() => setShowChecklistForm(true)}>+ Complete checklist</button>
          </div>

          {showChecklistForm && (
            <div className="card">
              <h2>Job-start safety checklist</h2>
              <div style={{ marginBottom: 16 }}>
                {checkItems.map((item, idx) => (
                  <label key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => setCheckItems((prev) => prev.map((it, i) => i === idx ? { ...it, checked: e.target.checked } : it))}
                      style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--accent)", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 14, color: item.checked ? "var(--text-muted)" : "var(--text)" }}>{item.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ marginBottom: 8, fontSize: 13, color: "var(--text-muted)" }}>
                {checkItems.filter((i) => i.checked).length} / {checkItems.length} items completed
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Completed by</label>
                  <input value={checklistBy} onChange={(e) => setChecklistBy(e.target.value)} placeholder="Crew lead name" />
                </div>
                <div className="field">
                  <label>Notes</label>
                  <input value={checklistNotes} onChange={(e) => setChecklistNotes(e.target.value)} placeholder="Any observations..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button className="btn btn-primary" onClick={saveChecklist} disabled={savingCL}>{savingCL ? "Saving..." : "Submit checklist"}</button>
                <button className="btn btn-ghost" onClick={() => setShowChecklistForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="card">
            <h2>Completed checklists ({checklists.length})</h2>
            {loading ? <p className="text-muted">Loading...</p> : checklists.length === 0 ? (
              <div className="empty-state">No checklists yet. Complete a job-start checklist before each job.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Completed by</th>
                      <th>Status</th>
                      <th>Items</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklists.map((c) => {
                      const items = Array.isArray(c.items) ? c.items : [];
                      const done = items.filter((i) => i.checked).length;
                      return (
                        <tr key={c.id}>
                          <td>{new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                          <td className="text-muted">{c.checklist_type.replace("_", " ")}</td>
                          <td>{c.completed_by ?? "—"}</td>
                          <td><span className={`badge ${c.status === "complete" ? "badge-green" : "badge-yellow"}`}>{c.status}</span></td>
                          <td className="text-muted">{done}/{items.length}</td>
                          <td className="text-muted">{c.notes ?? "—"}</td>
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

      {/* Incidents tab */}
      {tab === "incidents" && (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div />
            <button className="btn btn-primary" onClick={() => { setShowIncidentForm(true); setError(""); }}>+ Log incident</button>
          </div>

          {showIncidentForm && (
            <div className="card">
              <h2>Log incident / near miss</h2>
              <div className="form-grid">
                <div className="field">
                  <label>Date *</label>
                  <input type="date" value={incidentForm.incident_date} onChange={(e) => setIncidentForm((p) => ({ ...p, incident_date: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Incident type</label>
                  <select value={incidentForm.incident_type} onChange={(e) => setIncidentForm((p) => ({ ...p, incident_type: e.target.value }))}>
                    {INCIDENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Severity</label>
                  <select value={incidentForm.severity} onChange={(e) => setIncidentForm((p) => ({ ...p, severity: e.target.value }))}>
                    {SEVERITIES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Person involved</label>
                  <input value={incidentForm.involved_person} onChange={(e) => setIncidentForm((p) => ({ ...p, involved_person: e.target.value }))} placeholder="Name" />
                </div>
                <div className="field">
                  <label>Reported by</label>
                  <input value={incidentForm.reported_by} onChange={(e) => setIncidentForm((p) => ({ ...p, reported_by: e.target.value }))} />
                </div>
                <div className="field" style={{ alignItems: "flex-start", flexDirection: "row", gap: 10, paddingTop: 28 }}>
                  <input
                    type="checkbox"
                    id="osha"
                    checked={incidentForm.osha_recordable}
                    onChange={(e) => setIncidentForm((p) => ({ ...p, osha_recordable: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: "var(--danger)" }}
                  />
                  <label htmlFor="osha" style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>OSHA recordable</label>
                </div>
              </div>
              <div className="field mt-4">
                <label>Description *</label>
                <textarea value={incidentForm.description} onChange={(e) => setIncidentForm((p) => ({ ...p, description: e.target.value }))} placeholder="What happened, where, how..." rows={3} />
              </div>
              <div className="field mt-4">
                <label>Corrective action taken</label>
                <textarea value={incidentForm.corrective_action} onChange={(e) => setIncidentForm((p) => ({ ...p, corrective_action: e.target.value }))} rows={2} />
              </div>
              {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
              <div className="flex gap-3 mt-6">
                <button className="btn btn-primary" onClick={saveIncident} disabled={saving}>{saving ? "Saving..." : "Save incident"}</button>
                <button className="btn btn-ghost" onClick={() => { setShowIncidentForm(false); setIncidentForm(blankIncident); setError(""); }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="card">
            <h2>Incident log ({incidents.length})</h2>
            {loading ? <p className="text-muted">Loading...</p> : incidents.length === 0 ? (
              <div className="empty-state" style={{ color: "var(--success)" }}>✓ No incidents recorded. Great safety record!</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Person</th>
                      <th>OSHA</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((i) => (
                      <tr key={i.id}>
                        <td>{new Date(i.incident_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td style={{ fontWeight: 600 }}>{i.incident_type}</td>
                        <td><span className={`badge ${SEVERITY_BADGE[i.severity] ?? "badge-gray"}`}>{i.severity.replace("_", " ")}</span></td>
                        <td>{i.involved_person ?? "—"}</td>
                        <td>{i.osha_recordable ? <span className="badge badge-orange">Recordable</span> : <span className="badge badge-gray">No</span>}</td>
                        <td className="text-muted" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.description}</td>
                      </tr>
                    ))}
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
