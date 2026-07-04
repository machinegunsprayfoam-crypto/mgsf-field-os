"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type DashboardCounts = {
  customers: number;
  estimates: number;
  drafts: number;
  signed: number;
};

export default function DashboardPage() {
  const [counts, setCounts] = useState<DashboardCounts>({
    customers: 0,
    estimates: 0,
    drafts: 0,
    signed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [custRes, estRes, draftRes, signedRes] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("estimates").select("id", { count: "exact", head: true }),
        supabase.from("estimates").select("id", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("estimates").select("id", { count: "exact", head: true }).eq("status", "signed"),
      ]);
      setCounts({
        customers: custRes.count ?? 0,
        estimates: estRes.count ?? 0,
        drafts: draftRes.count ?? 0,
        signed: signedRes.count ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Machine Gun Spray Foam &amp; Concrete Lifting LLC</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Customers</div>
          <div className="value">{loading ? "—" : counts.customers}</div>
          <div className="sub">Total in system</div>
        </div>
        <div className="stat-card">
          <div className="label">Estimates</div>
          <div className="value">{loading ? "—" : counts.estimates}</div>
          <div className="sub">All time</div>
        </div>
        <div className="stat-card">
          <div className="label">Drafts</div>
          <div className="value">{loading ? "—" : counts.drafts}</div>
          <div className="sub">Pending send</div>
        </div>
        <div className="stat-card">
          <div className="label">Signed</div>
          <div className="value">{loading ? "—" : counts.signed}</div>
          <div className="sub">Won jobs</div>
        </div>
      </div>

      <div className="card">
        <h2>Quick actions</h2>
        <div className="flex gap-3">
          <a href="/customers" className="btn btn-ghost">+ New customer</a>
          <a href="/estimate" className="btn btn-primary">+ New estimate</a>
        </div>
      </div>

      <div className="card">
        <h2>Modules</h2>
        <div className="form-grid">
          {[
            { href: "/customers", label: "CRM", desc: "Customers & leads" },
            { href: "/estimate", label: "Estimating", desc: "Calculate job costs" },
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
                transition: "border-color 0.15s",
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
