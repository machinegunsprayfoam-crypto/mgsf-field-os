"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type MonthRevenue = { month: string; total: number };
type ServiceBreakdown = { service_type: string; count: number; revenue: number };

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);

  // Summary counts
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [signedCount, setSignedCount] = useState(0);
  const [totalEstimates, setTotalEstimates] = useState(0);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalProjects, setTotalProjects] = useState(0);
  const [completeProjects, setCompleteProjects] = useState(0);
  const [avgEstimate, setAvgEstimate] = useState(0);
  const [winRate, setWinRate] = useState(0);

  // Breakdowns
  const [byService, setByService] = useState<ServiceBreakdown[]>([]);
  const [recentEstimates, setRecentEstimates] = useState<{ id: string; project_name: string | null; service_type: string; status: string; total: number; created_at: string }[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthRevenue[]>([]);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);

      const [
        { data: estimates },
        { count: leadCount },
        { count: customerCount },
        { count: projectCount },
        { count: completeCount },
      ] = await Promise.all([
        supabase.from("estimates").select("id, project_name, service_type, status, total, created_at"),
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "complete"),
      ]);

      const allEst = estimates ?? [];
      const signed = allEst.filter((e) => e.status === "signed");
      const rev = signed.reduce((s: number, e: { total: number }) => s + (e.total ?? 0), 0);
      const avg = signed.length > 0 ? rev / signed.length : 0;
      const wr = allEst.length > 0 ? (signed.length / allEst.length) * 100 : 0;

      setTotalRevenue(rev);
      setSignedCount(signed.length);
      setTotalEstimates(allEst.length);
      setTotalLeads(leadCount ?? 0);
      setTotalCustomers(customerCount ?? 0);
      setTotalProjects(projectCount ?? 0);
      setCompleteProjects(completeCount ?? 0);
      setAvgEstimate(avg);
      setWinRate(wr);

      // Service breakdown
      const svcMap: Record<string, { count: number; revenue: number }> = {};
      for (const e of allEst) {
        const key = e.service_type ?? "Unknown";
        if (!svcMap[key]) svcMap[key] = { count: 0, revenue: 0 };
        svcMap[key].count++;
        if (e.status === "signed") svcMap[key].revenue += e.total ?? 0;
      }
      setByService(
        Object.entries(svcMap)
          .map(([service_type, v]) => ({ service_type, ...v }))
          .sort((a, b) => b.revenue - a.revenue)
      );

      // Recent estimates
      setRecentEstimates(
        [...allEst]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)
      );

      // Monthly revenue (last 12 months)
      const months: Record<string, number> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months[key] = 0;
      }
      for (const e of signed) {
        const d = new Date(e.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key in months) months[key] += e.total ?? 0;
      }
      setMonthlyRevenue(
        Object.entries(months).map(([month, total]) => ({ month, total }))
      );

      setLoading(false);
    }
    fetchAll();
  }, []);

  const maxMonthlyRev = Math.max(...monthlyRevenue.map((m) => m.total), 1);

  function fmt$(n: number) {
    return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  return (
    <>
      <div className="page-header">
        <h1>Reports & KPIs</h1>
        <p>Business performance at a glance</p>
      </div>

      {/* Top stats */}
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <div className="stat-card">
          <div className="label">Total revenue</div>
          <div className="value" style={{ color: "var(--success)" }}>{loading ? "—" : fmt$(totalRevenue)}</div>
          <div className="sub">Signed estimates</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg job value</div>
          <div className="value">{loading ? "—" : fmt$(avgEstimate)}</div>
          <div className="sub">Per signed deal</div>
        </div>
        <div className="stat-card">
          <div className="label">Win rate</div>
          <div className="value" style={{ color: winRate >= 50 ? "var(--success)" : "var(--warning)" }}>
            {loading ? "—" : winRate.toFixed(1) + "%"}
          </div>
          <div className="sub">Signed / all estimates</div>
        </div>
        <div className="stat-card">
          <div className="label">Total estimates</div>
          <div className="value">{loading ? "—" : totalEstimates}</div>
          <div className="sub">{signedCount} signed</div>
        </div>
        <div className="stat-card">
          <div className="label">Leads</div>
          <div className="value">{loading ? "—" : totalLeads}</div>
          <div className="sub">All time</div>
        </div>
        <div className="stat-card">
          <div className="label">Customers</div>
          <div className="value">{loading ? "—" : totalCustomers}</div>
          <div className="sub">In CRM</div>
        </div>
        <div className="stat-card">
          <div className="label">Projects</div>
          <div className="value">{loading ? "—" : totalProjects}</div>
          <div className="sub">{completeProjects} complete</div>
        </div>
      </div>

      {/* Monthly revenue bar chart */}
      <div className="card">
        <h2>Revenue by month (last 12 months)</h2>
        {loading ? <p className="text-muted">Loading...</p> : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160, padding: "8px 0" }}>
            {monthlyRevenue.map((m) => {
              const pct = (m.total / maxMonthlyRev) * 100;
              const label = m.month.slice(5); // MM
              return (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                    {m.total > 0 ? fmt$(m.total) : ""}
                  </div>
                  <div
                    title={`${m.month}: ${fmt$(m.total)}`}
                    style={{
                      width: "100%",
                      height: `${Math.max(pct, 2)}%`,
                      background: m.total > 0 ? "var(--accent)" : "var(--surface2)",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 0.3s",
                    }}
                  />
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {new Date(`${m.month}-15`).toLocaleDateString("en-US", { month: "short" })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Service type breakdown */}
      <div className="card">
        <h2>Revenue by service type</h2>
        {loading ? <p className="text-muted">Loading...</p> : byService.length === 0 ? (
          <div className="empty-state">No estimates yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Estimates</th>
                  <th>Revenue (signed)</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {byService.map((s) => (
                  <tr key={s.service_type}>
                    <td style={{ fontWeight: 600 }}>{s.service_type}</td>
                    <td className="text-muted">{s.count}</td>
                    <td style={{ fontWeight: 600, color: "var(--success)" }}>{fmt$(s.revenue)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ height: 8, borderRadius: 4, background: "var(--accent)", width: `${totalRevenue > 0 ? (s.revenue / totalRevenue) * 120 : 0}px` }} />
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                          {totalRevenue > 0 ? ((s.revenue / totalRevenue) * 100).toFixed(1) + "%" : "—"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent estimates */}
      <div className="card">
        <h2>Recent estimates (last 10)</h2>
        {loading ? <p className="text-muted">Loading...</p> : recentEstimates.length === 0 ? (
          <div className="empty-state">No estimates yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentEstimates.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}><a href={`/estimates/${e.id}`} style={{ color: "var(--text)", textDecoration: "none" }}>{e.project_name ?? "—"}</a></td>
                    <td className="text-muted">{e.service_type}</td>
                    <td>
                      <span className={`badge ${e.status === "signed" ? "badge-green" : e.status === "draft" ? "badge-yellow" : "badge-gray"}`}>
                        {e.status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt$(e.total)}</td>
                    <td className="text-muted">{new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
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
