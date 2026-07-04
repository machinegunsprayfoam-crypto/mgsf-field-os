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
                      <a href={`/estimates/${e.id}`} className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: 13 }}>
                        View →
                      </a>
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
