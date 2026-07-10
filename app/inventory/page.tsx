"use client";

import { useEffect, useState } from "react";
import { supabase, type InventoryItem } from "@/lib/supabase";

const CATEGORIES = ["consumable", "chemical", "protective_gear", "tool", "hardware", "other"];
const UNITS = ["each", "gallon", "lb", "board-ft", "roll", "box", "bag", "set", "ft"];

type NewItem = {
  name: string;
  category: string;
  unit: string;
  quantity_on_hand: string;
  reorder_point: string;
  unit_cost: string;
  supplier: string;
  part_number: string;
  location: string;
  notes: string;
};

const blank: NewItem = {
  name: "", category: "consumable", unit: "each",
  quantity_on_hand: "0", reorder_point: "0", unit_cost: "0",
  supplier: "", part_number: "", location: "", notes: "",
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewItem>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  async function fetchItems() {
    setLoading(true);
    const { data } = await supabase
      .from("inventory_items")
      .select("*")
      .order("name");
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchItems(); }, []);

  function setField(key: keyof NewItem, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Item name is required."); return; }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("inventory_items").insert({
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      quantity_on_hand: parseFloat(form.quantity_on_hand) || 0,
      reorder_point: parseFloat(form.reorder_point) || 0,
      unit_cost: parseFloat(form.unit_cost) || 0,
      supplier: form.supplier.trim() || null,
      part_number: form.part_number.trim() || null,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (err) { setError("Save failed: " + err.message); return; }
    setShowForm(false);
    setForm(blank);
    fetchItems();
  }

  async function adjustQty(id: string, delta: number) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, item.quantity_on_hand + delta);
    await supabase.from("inventory_items").update({ quantity_on_hand: newQty }).eq("id", id);
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, quantity_on_hand: newQty } : i));
  }

  const filtered = filter === "all" ? items
    : filter === "low" ? items.filter((i) => i.quantity_on_hand <= i.reorder_point)
    : items.filter((i) => i.category === filter);

  const lowCount = items.filter((i) => i.quantity_on_hand <= i.reorder_point).length;

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Inventory</h1>
            <p>Consumables, chemicals, and supplies</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
            + Add item
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Total items</div>
          <div className="value">{loading ? "—" : items.length}</div>
          <div className="sub">Tracked</div>
        </div>
        <div className="stat-card">
          <div className="label">Low / reorder</div>
          <div className="value" style={{ color: lowCount > 0 ? "var(--danger)" : "var(--text)" }}>
            {loading ? "—" : lowCount}
          </div>
          <div className="sub">Need restock</div>
        </div>
        <div className="stat-card">
          <div className="label">Inventory value</div>
          <div className="value">
            {loading ? "—" : "$" + items.reduce((s, i) => s + i.quantity_on_hand * i.unit_cost, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
          <div className="sub">At cost</div>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2>Add inventory item</h2>
          <div className="form-grid">
            <div className="field">
              <label>Item name *</label>
              <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Closed-cell foam — Set A" />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setField("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Unit</label>
              <select value={form.unit} onChange={(e) => setField("unit", e.target.value)}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Qty on hand</label>
              <input type="number" min={0} value={form.quantity_on_hand} onChange={(e) => setField("quantity_on_hand", e.target.value)} />
            </div>
            <div className="field">
              <label>Reorder point</label>
              <input type="number" min={0} value={form.reorder_point} onChange={(e) => setField("reorder_point", e.target.value)} />
            </div>
            <div className="field">
              <label>Unit cost ($)</label>
              <input type="number" min={0} step={0.01} value={form.unit_cost} onChange={(e) => setField("unit_cost", e.target.value)} />
            </div>
            <div className="field">
              <label>Supplier</label>
              <input value={form.supplier} onChange={(e) => setField("supplier", e.target.value)} placeholder="Spray foam supplier name" />
            </div>
            <div className="field">
              <label>Part / SKU number</label>
              <input value={form.part_number} onChange={(e) => setField("part_number", e.target.value)} />
            </div>
            <div className="field">
              <label>Storage location</label>
              <input value={form.location} onChange={(e) => setField("location", e.target.value)} placeholder="Shop shelf A3" />
            </div>
          </div>
          <div className="field mt-4">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
          <div className="flex gap-3 mt-6">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save item"}</button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setForm(blank); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <h2>Items ({filtered.length})</h2>
          <div className="flex gap-3">
            {["all", "low", ...CATEGORIES].map((f) => (
              <button key={f} className={`btn ${filter === f ? "btn-primary" : "btn-ghost"}`} style={{ padding: "5px 12px", fontSize: 13 }} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "low" ? `⚠ Low (${lowCount})` : f.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
        {loading ? <p className="text-muted">Loading...</p> : filtered.length === 0 ? (
          <div className="empty-state">No items{filter !== "all" ? " in this filter" : ". Add your first item above."}.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Qty on hand</th>
                  <th>Reorder at</th>
                  <th>Unit cost</th>
                  <th>Value</th>
                  <th>Adjust</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isLow = item.quantity_on_hand <= item.reorder_point;
                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        {item.supplier && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.supplier}</div>}
                      </td>
                      <td><span className="badge badge-gray">{item.category.replace("_", " ")}</span></td>
                      <td className="text-muted">{item.location ?? "—"}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: isLow ? "var(--danger)" : "var(--text)" }}>
                          {item.quantity_on_hand} {item.unit}
                        </span>
                        {isLow && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>Low</span>}
                      </td>
                      <td className="text-muted">{item.reorder_point} {item.unit}</td>
                      <td className="text-muted">${item.unit_cost.toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>${(item.quantity_on_hand * item.unit_cost).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                      <td>
                        <div className="flex gap-3" style={{ alignItems: "center" }}>
                          <button className="btn btn-ghost" style={{ padding: "3px 10px" }} onClick={() => adjustQty(item.id, -1)}>−</button>
                          <button className="btn btn-ghost" style={{ padding: "3px 10px" }} onClick={() => adjustQty(item.id, 1)}>+</button>
                        </div>
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
