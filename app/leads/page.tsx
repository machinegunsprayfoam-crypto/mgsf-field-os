"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FUNNEL_STAGES,
  FUNNEL_STAGE_BADGE,
  FUNNEL_STAGE_LABEL,
  LEAD_FOLLOW_UP_RULES,
  type FunnelStage,
  nextActionForStage,
} from "@/lib/funnel";
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

const STALE_EXCLUDED_STAGES = new Set<FunnelStage>(["lost", "completed", "scheduled"]);

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
  first_name: "",
  last_name: "",
  company_name: "",
  phone: "",
  email: "",
  lead_source: "",
  service_interest: "",
  property_address: "",
  city: "",
  state: "MT",
  square_feet: "",
  notes: "",
};

function toStage(status: string | null | undefined): FunnelStage {
  return FUNNEL_STAGES.includes(status as FunnelStage) ? (status as FunnelStage) : "new";
}

function followUpAtForStage(stage: FunnelStage) {
  const rule = LEAD_FOLLOW_UP_RULES[stage];
  return rule ? new Date(Date.now() + rule.hours * 60 * 60 * 1000).toISOString() : null;
}

function isOverdue(lead: Lead) {
  return !!lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() < Date.now();
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewLead>(blank);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dismissedStale, setDismissedStale] = useState(false);
  const [stageFilter, setStageFilter] = useState<"all" | FunnelStage>("all");

  async function fetchLeads() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (fetchError) {
      setError("Load failed: " + fetchError.message);
      setLeads([]);
    } else {
      setLeads((data ?? []) as Lead[]);
      setDismissedStale(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchLeads();
  }, []);

  function setField(key: keyof NewLead, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function displayName(lead: Lead) {
    if (lead.company_name) return lead.company_name;
    return [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
  }

  async function handleSave() {
    if (!form.first_name.trim() && !form.phone.trim()) {
      setError("Name or phone is required.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: saveError } = await supabase.from("leads").insert({
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
      next_follow_up_at: followUpAtForStage("new"),
    });
    setSaving(false);
    if (saveError) {
      setError("Save failed: " + saveError.message);
      return;
    }
    setShowForm(false);
    setForm(blank);
    fetchLeads();
  }

  async function updateStatus(id: string, status: string) {
    const stage = toStage(status);
    const prior = leads.find((lead) => lead.id === id);
    const now = new Date().toISOString();
    setStatusUpdatingId(id);
    setError("");
    const updates = {
      status: stage,
      last_contacted_at: now,
      next_follow_up_at: followUpAtForStage(stage),
    };
    const { error: updateError } = await supabase.from("leads").update(updates).eq("id", id);
    if (updateError) {
      setError("Status update failed: " + updateError.message);
      setStatusUpdatingId(null);
      return;
    }
    if (prior && prior.status !== stage) {
      await supabase.from("lead_activity_log").insert({
        lead_id: id,
        stage_from: prior.status,
        stage_to: stage,
        note: `Lead moved to ${FUNNEL_STAGE_LABEL[stage]}`,
        performed_by: "FieldOS",
      });
    }
    setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, ...updates } : lead)));
    setStatusUpdatingId(null);
  }

  async function convertToJob(lead: Lead) {
    setConvertingId(lead.id);
    setError("");
    try {
      let customerId = lead.converted_customer_id;
      if (!customerId) {
        const { data: customer, error: customerError } = await supabase
          .from("customers")
          .insert({
            customer_type: lead.company_name ? "commercial" : "residential",
            company_name: lead.company_name,
            first_name: lead.first_name,
            last_name: lead.last_name,
            phone: lead.phone,
            email: lead.email,
            lead_source: lead.lead_source,
            notes: lead.notes,
          })
          .select("id")
          .single();
        if (customerError || !customer) throw customerError ?? new Error("Customer creation failed.");
        customerId = customer.id;
      }

      const projectName = `${lead.service_interest || "Project"} — ${displayName(lead)}`;
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          customer_id: customerId,
          source_lead_id: lead.id,
          project_name: projectName,
          status: "scheduled",
        })
        .select("id")
        .single();
      if (projectError || !project) throw projectError ?? new Error("Project creation failed.");

      const now = new Date().toISOString();
      const { error: leadError } = await supabase
        .from("leads")
        .update({
          converted_customer_id: customerId,
          converted_project_id: project.id,
          status: "scheduled",
          last_contacted_at: now,
          next_follow_up_at: null,
        })
        .eq("id", lead.id);
      if (leadError) throw leadError;

      const { error: logError } = await supabase.from("lead_activity_log").insert({
        lead_id: lead.id,
        stage_from: lead.status,
        stage_to: "scheduled",
        note: `Converted to job ${projectName}`,
        performed_by: "FieldOS",
      });
      if (logError) throw logError;

      await fetchLeads();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError("Conversion failed: " + message);
    } finally {
      setConvertingId(null);
    }
  }

  const staleLeads = useMemo(
    () => leads.filter((lead) => isOverdue(lead) && !STALE_EXCLUDED_STAGES.has(toStage(lead.status))),
    [leads]
  );

  const filteredLeads = useMemo(
    () => (stageFilter === "all" ? leads : leads.filter((lead) => toStage(lead.status) === stageFilter)),
    [leads, stageFilter]
  );

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Leads</h1>
            <p>Capture, follow up, and convert incoming leads into scheduled jobs</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowForm(true);
              setError("");
            }}
          >
            + New lead
          </button>
        </div>
      </div>

      {!dismissedStale && staleLeads.length > 0 && (
        <div
          className="card"
          style={{ borderColor: "rgba(250,204,21,0.4)", background: "rgba(250,204,21,0.08)" }}
        >
          <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <h2 style={{ marginBottom: 6 }}>⚠️ {staleLeads.length} stale lead{staleLeads.length === 1 ? "" : "s"} need follow-up</h2>
              <p className="text-muted">Overdue leads are past their next follow-up deadline.</p>
            </div>
            <button className="btn btn-ghost" onClick={() => setDismissedStale(true)}>
              Dismiss
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {staleLeads.map((lead) => {
              const stage = toStage(lead.status);
              return (
                <div
                  key={lead.id}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid rgba(250,204,21,0.25)",
                    borderRadius: 8,
                    background: "rgba(15,17,23,0.45)",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{displayName(lead)}</div>
                  <span className={`badge ${FUNNEL_STAGE_BADGE[stage]}`}>{FUNNEL_STAGE_LABEL[stage]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{error}</p>}

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
                {LEAD_SOURCES.map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Service needed</label>
              <select value={form.service_interest} onChange={(e) => setField("service_interest", e.target.value)}>
                <option value="">— Select —</option>
                {SERVICE_OPTIONS.map((service) => (
                  <option key={service}>{service}</option>
                ))}
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
          <div className="flex gap-3 mt-6">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save lead"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setShowForm(false);
                setForm(blank);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <h2>
            {stageFilter === "all" ? "All leads" : FUNNEL_STAGE_LABEL[stageFilter]} ({filteredLeads.length})
          </h2>
          <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
            <button className={`btn ${stageFilter === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setStageFilter("all")}>
              All ({leads.length})
            </button>
            {FUNNEL_STAGES.map((stage) => (
              <button
                key={stage}
                className={`btn ${stageFilter === stage ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setStageFilter(stage)}
              >
                {FUNNEL_STAGE_LABEL[stage]} ({leads.filter((lead) => toStage(lead.status) === stage).length})
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : filteredLeads.length === 0 ? (
          <div className="empty-state">No leads match this stage yet.</div>
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
                  <th>Next action</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const stage = toStage(lead.status);
                  const overdue = isOverdue(lead) && !STALE_EXCLUDED_STAGES.has(stage);
                  const canConvert = stage === "won" && !lead.converted_project_id;
                  return (
                    <tr key={lead.id}>
                      <td style={{ fontWeight: 600 }}>{displayName(lead)}</td>
                      <td>
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} style={{ color: "var(--accent)" }}>
                            {lead.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{lead.service_interest ?? "—"}</td>
                      <td>{[lead.city, lead.state].filter(Boolean).join(", ") || "—"}</td>
                      <td>{lead.lead_source ?? "—"}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 150 }}>
                          <span className={`badge ${FUNNEL_STAGE_BADGE[stage]}`}>{FUNNEL_STAGE_LABEL[stage]}</span>
                          <select
                            value={stage}
                            onChange={(e) => updateStatus(lead.id, e.target.value)}
                            disabled={statusUpdatingId === lead.id || convertingId === lead.id}
                            style={{
                              background: "var(--surface2)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                              borderRadius: 6,
                              padding: "3px 8px",
                              fontSize: 13,
                            }}
                          >
                            {FUNNEL_STAGES.map((option) => (
                              <option key={option} value={option}>
                                {FUNNEL_STAGE_LABEL[option]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td style={{ color: overdue ? "var(--danger)" : "var(--text-muted)", minWidth: 220 }}>
                        <div style={{ fontWeight: overdue ? 600 : 500 }}>{nextActionForStage(stage)}</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {lead.next_follow_up_at
                            ? `Due ${new Date(lead.next_follow_up_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                            : "No follow-up scheduled"}
                        </div>
                      </td>
                      <td className="text-muted">
                        {new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td>
                        {canConvert ? (
                          <button className="btn btn-primary" onClick={() => convertToJob(lead)} disabled={convertingId === lead.id}>
                            {convertingId === lead.id ? "Converting..." : "Convert → Job"}
                          </button>
                        ) : lead.converted_project_id ? (
                          <span className="badge badge-green">Job created</span>
                        ) : (
                          "—"
                        )}
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
  );
}
