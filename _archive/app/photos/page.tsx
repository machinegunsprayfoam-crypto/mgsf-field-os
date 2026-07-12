"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, type FieldPhoto } from "@/lib/supabase";

const STAGES = [
  { key: "before", label: "Before", color: "badge-yellow" },
  { key: "during", label: "During", color: "badge-orange" },
  { key: "after", label: "After", color: "badge-green" },
];

type NewPhoto = {
  photo_stage: string;
  file_name: string;
  file_url: string;
  caption: string;
};

const blank: NewPhoto = { photo_stage: "before", file_name: "", file_url: "", caption: "" };

export default function PhotosPage() {
  const [photos, setPhotos] = useState<FieldPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewPhoto>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchPhotos() {
    setLoading(true);
    const { data } = await supabase
      .from("field_photos")
      .select("*")
      .order("created_at", { ascending: false });
    setPhotos(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchPhotos(); }, []);

  function setField(key: keyof NewPhoto, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setField("file_name", file.name);
    // Create object URL for local preview
    const url = URL.createObjectURL(file);
    setField("file_url", url);
  }

  async function handleSave() {
    if (!form.file_name) { setError("Select a photo file."); return; }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("field_photos").insert({
      photo_stage: form.photo_stage,
      file_name: form.file_name,
      file_url: form.file_url || null,
      caption: form.caption.trim() || null,
    });
    setSaving(false);
    if (err) { setError("Save failed: " + err.message); return; }
    setShowForm(false);
    setForm(blank);
    fetchPhotos();
  }

  const filtered = filter === "all" ? photos : photos.filter((p) => p.photo_stage === filter);

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Photo log</h1>
            <p>Before, during, and after job photos</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
            + Add photo entry
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2>Log photo</h2>
          <div className="form-grid">
            <div className="field">
              <label>Stage</label>
              <select value={form.photo_stage} onChange={(e) => setField("photo_stage", e.target.value)}>
                <option value="before">Before</option>
                <option value="during">During</option>
                <option value="after">After</option>
              </select>
            </div>
            <div className="field">
              <label>Photo file</label>
              <input
                type="file"
                ref={fileRef}
                accept="image/*"
                onChange={handleFileChange}
                style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", cursor: "pointer" }}
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Caption / notes</label>
              <input value={form.caption} onChange={(e) => setField("caption", e.target.value)} placeholder="What does this photo show?" />
            </div>
          </div>
          {form.file_url && (
            <div style={{ marginTop: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.file_url} alt="Preview" style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8, border: "1px solid var(--border)", objectFit: "cover" }} />
            </div>
          )}
          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
          <div className="flex gap-3 mt-6">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save photo"}</button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setForm(blank); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-3" style={{ marginBottom: 20 }}>
        {[{ key: "all", label: "All" }, ...STAGES].map((s) => (
          <button
            key={s.key}
            className={`btn ${filter === s.key ? "btn-primary" : "btn-ghost"}`}
            style={{ padding: "6px 16px", fontSize: 13 }}
            onClick={() => setFilter(s.key)}
          >
            {s.label} ({s.key === "all" ? photos.length : photos.filter((p) => p.photo_stage === s.key).length})
          </button>
        ))}
      </div>

      {loading ? <p className="text-muted">Loading...</p> : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">No photos in this category yet.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {filtered.map((photo) => {
            const stage = STAGES.find((s) => s.key === photo.photo_stage);
            return (
              <div key={photo.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                {photo.file_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.file_url} alt={photo.file_name} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: 160, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                    📷
                  </div>
                )}
                <div style={{ padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span className={`badge ${stage?.color ?? "badge-gray"}`}>{stage?.label ?? photo.photo_stage}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {new Date(photo.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", wordBreak: "break-word" }}>
                    {photo.caption || photo.file_name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
