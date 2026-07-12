"use client";

import { useEffect, useState } from "react";
import { supabase, type Estimate } from "@/lib/supabase";
import { serviceLabels, type ServiceType } from "@/lib/estimating";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const STATUS_COLOR: Record<string, string> = {
  draft: "badge-gray",
  sent: "badge-yellow",
  approved: "badge-green",
  signed: "badge-green",
  declined: "badge-gray",
};

type EstimateWithCustomer = Estimate & {
  customers: { first_name: string | null; last_name: string | null; company_name: string | null } | null;
};

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<EstimateWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLinks, setPortalLinks] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function fetchEstimates() {
    setLoading(true);
    const { data } = await supabase
      .from("estimates")
      .select("*, customers(first_name, last_name, company_name)")
      .order("created_at", { ascending: false });
    setEstimates((data as EstimateWithCustomer[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchEstimates(); }, []);

  async function updateStatus(id: string, status: string) {
    await supabase.from("estimates").update({ status }).eq("id", id);
    setEstimates((prev) => prev.map((e) => e.id === id ? { ...e, status } : e));
  }

  function customerName(e: EstimateWithCustomer) {
    const c = e.customers;
    if (!c) return "—";
    if (c.company_name) return c.company_name;
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
  }

  function serviceLabel(s: string) {
    return serviceLabels[s as ServiceType] ?? s;
  }

  async function generatePortalLink(estimateId: string) {
    setGenerating(estimateId);
    // Create or retrieve portal token
    const { data: existing } = await supabase
      .from("portal_tokens")
      .select("token")
      .eq("estimate_id", estimateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let token = existing?.token;
    if (!token) {
      const { data: created } = await supabase
        .from("portal_tokens")
        .insert({ estimate_id: estimateId })
        .select("token")
        .single();
      token = created?.token;
    }

    if (token) {
      const link = `${window.location.origin}/portal/${token}`;
      setPortalLinks((p) => ({ ...p, [estimateId]: link }));
      setGenerating(null);
      return link;
    }
    setGenerating(null);
    return "";
  }

  async function copyPortalLink(estimateId: string) {
    const link = portalLinks[estimateId] || await generatePortalLink(estimateId);
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopiedId(estimateId);
    window.setTimeout(() => {
      setCopiedId((current) => current === estimateId ? null : current);
    }, 2000);
  }

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Estimates</h1>
            <p>All quotes — track status and access proposals</p>
          </div>
          <a href="/estimate" className="btn btn-primary">+ New estimate</a>
        </div>
      </div>

      <div className="card">
        {loading ? <p className="text-muted">Loading...</p> : estimates.length === 0 ? (
          <div className="empty-state">No estimates yet. <a href="/estimate" style={{ color: "var(--accent)" }}>Create your first one.</a></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Project</th>
                  <th>Service</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {estimates.map((e, i) => (
                  <tr key={e.id}>
                    <td className="text-muted">{estimates.length - i}</td>
                    <td style={{ fontWeight: 600 }}>{customerName(e)}</td>
                    <td>{e.project_name ?? "—"}</td>
                    <td style={{ fontSize: 13 }}>{serviceLabel(e.service_type)}</td>
                    <td style={{ fontWeight: 600, color: "var(--accent)" }}>{fmt(e.total)}</td>
                    <td>
                      <select
                        value={e.status}
                        onChange={(ev) => updateStatus(e.id, ev.target.value)}
                        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                      >
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="approved">Approved</option>
                        <option value="signed">Signed</option>
                        <option value="declined">Declined</option>
                      </select>
                    </td>
                    <td className="text-muted">
                      {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td>
                      <div className="flex gap-3">
                        <a href={`/estimates/${e.id}`} className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: 13 }}>
                          View →
                        </a>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => void generatePortalLink(e.id)}
                          disabled={generating === e.id}
                          title="Generate customer portal link"
                        >
                          {generating === e.id ? "…" : "🔗 Share"}
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => void copyPortalLink(e.id)}
                          title={copiedId === e.id ? "Link copied" : "Copy customer portal link"}
                        >
                          {copiedId === e.id ? "✓ Copied!" : "📋 Copy link"}
                        </button>
                      </div>
                      {portalLinks[e.id] && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {portalLinks[e.id]}
                        </div>
                      )}
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
