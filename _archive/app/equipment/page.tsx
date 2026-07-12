"use client";

import { useEffect, useState } from "react";
import { supabase, type Equipment } from "@/lib/supabase";

const EQUIPMENT_TYPES = ["spray_rig", "truck", "trailer", "compressor", "generator", "lift", "hand_tool", "safety_gear", "other"];
const STATUSES = ["operational", "needs_service", "out_of_service", "sold"];

type NewEquipment = {
  name: string;
  equipment_type: string;
  make: string;
  model: string;
  year: string;
  serial_number: string;
  vin: string;
  license_plate: string;
  status: string;
  location: string;
  purchase_date: string;
  purchase_price: string;
  next_service_date: string;
  notes: string;
};

const blank: NewEquipment = {
  name: "", equipment_type: "spray_rig", make: "", model: "", year: "",
  serial_number: "", vin: "", license_plate: "", status: "operational",
  location: "", purchase_date: "", purchase_price: "", next_service_date: "", notes: "",
};

const STATUS_BADGE: Record<string, string> = {
  operational: "badge-green",
  needs_service: "badge-yellow",
  out_of_service: "badge-orange",
  sold: "badge-gray",
};

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewEquipment>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showService, setShowService] = useState<string | null>(null);
  const [svcDate, setSvcDate] = useState("");
  const [svcType, setSvcType] = useState("");
  const [svcNotes, setSvcNotes] = useState("");
  const [svcCost, setSvcCost] = useState("");
  const [svcNextDate, setSvcNextDate] = useState("");

  async function fetchEquipment() {
    setLoading(true);
    const { data } = await supabase.from("equipment").select("*").order("name");
    setEquipment(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchEquipment(); }, []);

  function setField(key: keyof NewEquipment, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("equipment").insert({
      name: form.name.trim(),
      equipment_type: form.equipment_type,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      year: form.year ? parseInt(form.year) : null,
      serial_number: form.serial_number.trim() || null,
      vin: form.vin.trim() || null,
      license_plate: form.license_plate.trim() || null,
      status: form.status,
      location: form.location.trim() || null,
      purchase_date: form.purchase_date || null,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
      next_service_date: form.next_service_date || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (err) { setError("Save failed: " + err.message); return; }
    setShowForm(false);
    setForm(blank);
    fetchEquipment();
  }

  async function logService(equipmentId: string) {
    if (!svcDate || !svcType.trim()) return;
    await supabase.from("equipment_service_log").insert({
      equipment_id: equipmentId,
      service_type: svcType.trim(),
      service_date: svcDate,
      cost: svcCost ? parseFloat(svcCost) : null,
      notes: svcNotes.trim() || null,
    });
    // Update next_service_date and status on the equipment record if provided
    if (svcNextDate) {
      await supabase
        .from("equipment")
        .update({ next_service_date: svcNextDate, status: "operational" })
        .eq("id", equipmentId);
    }
    setShowService(null);
    setSvcDate(""); setSvcType(""); setSvcNotes(""); setSvcCost(""); setSvcNextDate("");
    fetchEquipment();
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from("equipment").update({ status }).eq("id", id);
    setEquipment((prev) => prev.map((e) => e.id === id ? { ...e, status } : e));
  }

  const needsServiceSoon = equipment.filter((e) => {
    if (!e.next_service_date) return false;
    const days = (new Date(e.next_service_date).getTime() - Date.now()) / 86400000;
    return days <= 30;
  });

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Equipment & Fleet</h1>
            <p>Spray rigs, trucks, trailers, and tools</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
            + Add equipment
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Total assets</div>
          <div className="value">{loading ? "—" : equipment.length}</div>
          <div className="sub">In system</div>
        </div>
        <div className="stat-card">
          <div className="label">Operational</div>
          <div className="value">{loading ? "—" : equipment.filter((e) => e.status === "operational").length}</div>
          <div className="sub">Ready</div>
        </div>
        <div className="stat-card">
          <div className="label">Needs service</div>
          <div className="value" style={{ color: needsServiceSoon.length > 0 ? "var(--warning)" : "var(--text)" }}>
            {loading ? "—" : needsServiceSoon.length}
          </div>
          <div className="sub">Due within 30 days</div>
        </div>
        <div className="stat-card">
          <div className="label">Out of service</div>
          <div className="value" style={{ color: equipment.filter((e) => e.status === "out_of_service").length > 0 ? "var(--danger)" : "var(--text)" }}>
            {loading ? "—" : equipment.filter((e) => e.status === "out_of_service").length}
          </div>
          <div className="sub">Down</div>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2>Add equipment</h2>
          <div className="form-grid cols-3">
            <div className="field">
              <label>Name / nickname *</label>
              <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Rig 1 — Graco Reactor E-30" />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={form.equipment_type} onChange={(e) => setField("equipment_type", e.target.value)}>
                {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setField("status", e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Make</label>
              <input value={form.make} onChange={(e) => setField("make", e.target.value)} placeholder="Graco" />
            </div>
            <div className="field">
              <label>Model</label>
              <input value={form.model} onChange={(e) => setField("model", e.target.value)} placeholder="Reactor E-30" />
            </div>
            <div className="field">
              <label>Year</label>
              <input type="number" min={1990} max={2030} value={form.year} onChange={(e) => setField("year", e.target.value)} placeholder="2022" />
            </div>
            <div className="field">
              <label>Serial number</label>
              <input value={form.serial_number} onChange={(e) => setField("serial_number", e.target.value)} />
            </div>
            <div className="field">
              <label>VIN (vehicles)</label>
              <input value={form.vin} onChange={(e) => setField("vin", e.target.value)} />
            </div>
            <div className="field">
              <label>License plate</label>
              <input value={form.license_plate} onChange={(e) => setField("license_plate", e.target.value)} />
            </div>
            <div className="field">
              <label>Location</label>
              <input value={form.location} onChange={(e) => setField("location", e.target.value)} placeholder="Shop bay 1" />
            </div>
            <div className="field">
              <label>Purchase date</label>
              <input type="date" value={form.purchase_date} onChange={(e) => setField("purchase_date", e.target.value)} />
            </div>
            <div className="field">
              <label>Purchase price ($)</label>
              <input type="number" min={0} value={form.purchase_price} onChange={(e) => setField("purchase_price", e.target.value)} />
            </div>
            <div className="field">
              <label>Next service date</label>
              <input type="date" value={form.next_service_date} onChange={(e) => setField("next_service_date", e.target.value)} />
            </div>
          </div>
          <div className="field mt-4">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
          <div className="flex gap-3 mt-6">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setForm(blank); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {showService && (
        <div className="card">
          <h2>Log service</h2>
          <div className="form-grid">
            <div className="field">
              <label>Service type *</label>
              <input value={svcType} onChange={(e) => setSvcType(e.target.value)} placeholder="Oil change, hose replacement, inspection..." />
            </div>
            <div className="field">
              <label>Date *</label>
              <input type="date" value={svcDate} onChange={(e) => setSvcDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Cost ($)</label>
              <input type="number" min={0} value={svcCost} onChange={(e) => setSvcCost(e.target.value)} />
            </div>
            <div className="field">
              <label>Next service date</label>
              <input type="date" value={svcNextDate} onChange={(e) => setSvcNextDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Notes</label>
              <input value={svcNotes} onChange={(e) => setSvcNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button className="btn btn-primary" onClick={() => logService(showService)}>Save service log</button>
            <button className="btn btn-ghost" onClick={() => { setShowService(null); setSvcNextDate(""); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>All equipment ({equipment.length})</h2>
        {loading ? <p className="text-muted">Loading...</p> : equipment.length === 0 ? (
          <div className="empty-state">No equipment yet. Add your spray rigs, trucks, and tools above.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Make / Model</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Next service</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((e) => {
                  const daysToService = e.next_service_date
                    ? Math.round((new Date(e.next_service_date).getTime() - Date.now()) / 86400000)
                    : null;
                  return (
                    <tr key={e.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{e.name}</div>
                        {e.year && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.year}</div>}
                      </td>
                      <td className="text-muted">{e.equipment_type.replace("_", " ")}</td>
                      <td className="text-muted">{[e.make, e.model].filter(Boolean).join(" ") || "—"}</td>
                      <td>
                        <select
                          value={e.status}
                          onChange={(ev) => updateStatus(e.id, ev.target.value)}
                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                        </select>
                      </td>
                      <td className="text-muted">{e.location ?? "—"}</td>
                      <td>
                        {daysToService !== null ? (
                          <span style={{ color: daysToService <= 0 ? "var(--danger)" : daysToService <= 14 ? "var(--warning)" : "var(--text-muted)", fontSize: 13 }}>
                            {daysToService <= 0 ? "Overdue" : `${daysToService}d`}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => { setShowService(e.id); setSvcDate(""); setSvcType(""); setSvcNotes(""); setSvcCost(""); setSvcNextDate(""); }}>
                          Log service
                        </button>
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
