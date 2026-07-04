"use client";

import { useEffect, useState } from "react";
import { supabase, type MarketingPost } from "@/lib/supabase";

const PLATFORMS = ["facebook", "instagram", "google_business", "website", "email", "linkedin", "tiktok", "other"];
const STATUSES = ["idea", "draft", "scheduled", "published", "archived"];

const CONTENT_IDEAS = [
  "Before & after spray foam job photo",
  "Customer testimonial / review spotlight",
  "Behind the scenes — spray rig setup",
  "FAQ: What is closed-cell vs open-cell foam?",
  "Seasonal tip: Seal your crawl space before winter",
  "Time-lapse of concrete lifting job",
  "Team introduction post",
  "Service area highlight — new city/county",
  "Safety spotlight — our PPE on the job",
  "Energy savings infographic",
];

type NewPost = {
  title: string;
  content: string;
  platform: string;
  status: string;
  scheduled_date: string;
  image_url: string;
  tags: string;
  notes: string;
};

const blank: NewPost = {
  title: "", content: "", platform: "facebook",
  status: "idea", scheduled_date: "", image_url: "", tags: "", notes: "",
};

const STATUS_BADGE: Record<string, string> = {
  idea: "badge-gray",
  draft: "badge-yellow",
  scheduled: "badge-orange",
  published: "badge-green",
  archived: "badge-gray",
};

const PLATFORM_ICON: Record<string, string> = {
  facebook: "📘",
  instagram: "📸",
  google_business: "🔍",
  website: "🌐",
  email: "📧",
  linkedin: "💼",
  tiktok: "🎵",
  other: "📣",
};

export default function MarketingPage() {
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewPost>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  async function fetchPosts() {
    setLoading(true);
    const { data } = await supabase
      .from("marketing_posts")
      .select("*")
      .order("scheduled_date", { ascending: true, nullsFirst: false });
    setPosts(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchPosts(); }, []);

  function setField(key: keyof NewPost, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const { error: err } = await supabase.from("marketing_posts").insert({
      title: form.title.trim(),
      content: form.content.trim() || null,
      platform: form.platform,
      status: form.status,
      scheduled_date: form.scheduled_date || null,
      image_url: form.image_url.trim() || null,
      tags: form.tags.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (err) { setError("Save failed: " + err.message); return; }
    setShowForm(false);
    setForm(blank);
    fetchPosts();
  }

  async function updateStatus(id: string, status: string) {
    const update: Record<string, unknown> = { status };
    if (status === "published") update.published_at = new Date().toISOString();
    await supabase.from("marketing_posts").update(update).eq("id", id);
    setPosts((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
  }

  const filtered = filter === "all" ? posts : posts.filter((p) => p.status === filter || p.platform === filter);
  const upcoming = posts.filter((p) => p.status === "scheduled" && p.scheduled_date);
  const published = posts.filter((p) => p.status === "published").length;
  const ideas = posts.filter((p) => p.status === "idea").length;

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Marketing Hub</h1>
            <p>Content calendar for social media, Google, and email</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
            + Add post
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Total posts</div>
          <div className="value">{loading ? "—" : posts.length}</div>
          <div className="sub">In system</div>
        </div>
        <div className="stat-card">
          <div className="label">Published</div>
          <div className="value" style={{ color: "var(--success)" }}>{loading ? "—" : published}</div>
          <div className="sub">Live</div>
        </div>
        <div className="stat-card">
          <div className="label">Scheduled</div>
          <div className="value" style={{ color: "var(--warning)" }}>{loading ? "—" : upcoming.length}</div>
          <div className="sub">Coming up</div>
        </div>
        <div className="stat-card">
          <div className="label">Ideas</div>
          <div className="value">{loading ? "—" : ideas}</div>
          <div className="sub">Backlog</div>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2>Add post / content idea</h2>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Title *</label>
              <input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Before & after — crawl space foam" />
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CONTENT_IDEAS.map((idea) => (
                  <button key={idea} className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setField("title", idea)}>
                    {idea}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Platform</label>
              <select value={form.platform} onChange={(e) => setField("platform", e.target.value)}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_ICON[p]} {p.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setField("status", e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Scheduled date</label>
              <input type="date" value={form.scheduled_date} onChange={(e) => setField("scheduled_date", e.target.value)} />
            </div>
            <div className="field">
              <label>Image URL (Drive, etc.)</label>
              <input value={form.image_url} onChange={(e) => setField("image_url", e.target.value)} placeholder="https://..." />
            </div>
            <div className="field">
              <label>Tags</label>
              <input value={form.tags} onChange={(e) => setField("tags", e.target.value)} placeholder="before-after, spray-foam, commercial" />
            </div>
          </div>
          <div className="field mt-4">
            <label>Post content / caption</label>
            <textarea value={form.content} onChange={(e) => setField("content", e.target.value)} placeholder="Write the caption or post body here..." rows={4} />
          </div>
          <div className="field mt-4">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} />
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
          <div className="flex gap-3 mt-6">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setForm(blank); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Upcoming scheduled */}
      {upcoming.length > 0 && (
        <div className="card">
          <h2>Upcoming scheduled ({upcoming.length})</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {upcoming
              .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""))
              .map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface2)", borderRadius: 8, padding: "12px 16px", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 22 }}>{PLATFORM_ICON[p.platform] ?? "📣"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {p.platform.replace("_", " ")} · {p.scheduled_date ? new Date(p.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""}
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => updateStatus(p.id, "published")}>
                    Mark published
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* All posts */}
      <div className="card">
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <h2>All posts ({filtered.length})</h2>
          <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
            {["all", ...STATUSES].map((f) => (
              <button key={f} className={`btn ${filter === f ? "btn-primary" : "btn-ghost"}`} style={{ padding: "5px 12px", fontSize: 13 }} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>
        </div>
        {loading ? <p className="text-muted">Loading...</p> : filtered.length === 0 ? (
          <div className="empty-state">No posts{filter !== "all" ? " in this filter" : ". Start your content calendar above."}.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Tags</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 18 }}>{PLATFORM_ICON[p.platform] ?? "📣"} <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{p.platform.replace("_", " ")}</span></td>
                    <td style={{ fontWeight: 600 }}>
                      {p.title}
                      {p.content && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content}</div>}
                    </td>
                    <td><span className={`badge ${STATUS_BADGE[p.status] ?? "badge-gray"}`}>{p.status}</span></td>
                    <td className="text-muted">
                      {p.scheduled_date ? new Date(p.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{p.tags ?? "—"}</td>
                    <td>
                      <select
                        value={p.status}
                        onChange={(e) => updateStatus(p.id, e.target.value)}
                        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "3px 8px", fontSize: 12 }}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
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
