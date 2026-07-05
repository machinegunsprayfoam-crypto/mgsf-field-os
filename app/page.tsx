"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Counts = {
  customers: number;
  leads: number;
  estimates: number;
  drafts: number;
  signed: number;
  projects: number;
  scheduled: number;
  complete: number;
};

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts>({
    customers: 0, leads: 0, estimates: 0, drafts: 0,
    signed: 0, projects: 0, scheduled: 0, complete: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [custRes, leadRes, estRes, draftRes, signedRes, projRes, schedRes, compRes] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("estimates").select("id", { count: "exact", head: true }),
        supabase.from("estimates").select("id", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("estimates").select("id", { count: "exact", head: true }).eq("status", "signed"),
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "complete"),
      ]);
      setCounts({
        customers: custRes.count ?? 0,
        leads: leadRes.count ?? 0,
        estimates: estRes.count ?? 0,
        drafts: draftRes.count ?? 0,
        signed: signedRes.count ?? 0,
        projects: projRes.count ?? 0,
        scheduled: schedRes.count ?? 0,
        complete: compRes.count ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const v = (n: number) => loading ? "—" : n;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Machine Gun Spray Foam &amp; Concrete Lifting LLC</p>
      </div>

      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)" }}>CRM</div>
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <div className="stat-card">
          <div className="label">New leads</div>
          <div className="value">{v(counts.leads)}</div>
          <div className="sub">Awaiting contact</div>
        </div>
        <div className="stat-card">
          <div className="label">Customers</div>
          <div className="value">{v(counts.customers)}</div>
          <div className="sub">In system</div>
        </div>
      </div>

      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)" }}>Estimating</div>
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <div className="stat-card">
          <div className="label">Total estimates</div>
          <div className="value">{v(counts.estimates)}</div>
          <div className="sub">All time</div>
        </div>
        <div className="stat-card">
          <div className="label">Drafts</div>
          <div className="value">{v(counts.drafts)}</div>
          <div className="sub">Pending send</div>
        </div>
        <div className="stat-card">
          <div className="label">Signed</div>
          <div className="value">{v(counts.signed)}</div>
          <div className="sub">Won jobs</div>
        </div>
      </div>

      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)" }}>Projects</div>
      <div className="stat-grid" style={{ marginBottom: 32 }}>
        <div className="stat-card">
          <div className="label">Total projects</div>
          <div className="value">{v(counts.projects)}</div>
          <div className="sub">All time</div>
        </div>
        <div className="stat-card">
          <div className="label">Scheduled</div>
          <div className="value">{v(counts.scheduled)}</div>
          <div className="sub">Upcoming</div>
        </div>
        <div className="stat-card">
          <div className="label">Complete</div>
          <div className="value">{v(counts.complete)}</div>
          <div className="sub">Finished jobs</div>
        </div>
      </div>

      <div className="card">
        <h2>Quick actions</h2>
        <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
          <a href="/leads" className="btn btn-ghost">+ New lead</a>
          <a href="/customers" className="btn btn-ghost">+ New customer</a>
          <a href="/estimate" className="btn btn-primary">+ New estimate</a>
          <a href="/projects" className="btn btn-ghost">+ New project</a>
          <a href="/photos" className="btn btn-ghost">+ Log photo</a>
        </div>
      </div>

      <div className="card">
        <h2>Modules</h2>
        <div className="form-grid">
          {[
            { href: "/leads", label: "Leads", desc: "Capture & qualify incoming leads" },
            { href: "/customers", label: "CRM", desc: "Customer records" },
            { href: "/estimates", label: "Estimates", desc: "All quotes & proposals" },
            { href: "/estimate", label: "Estimating", desc: "Calculate job costs" },
            { href: "/projects", label: "Projects", desc: "Scheduling & status board" },
            { href: "/photos", label: "Photo log", desc: "Before / during / after photos" },
          ].map((m) => (
            <a
              key={m.href}
              href={m.href}
              style={{
                display: "block",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "16px",
                textDecoration: "none",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{m.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

