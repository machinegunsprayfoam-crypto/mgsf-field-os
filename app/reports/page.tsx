"use client";

import { useEffect, useState } from "react";
import { supabase, type Lead, type Project } from "@/lib/supabase";
import { serviceLabels, type ServiceType } from "@/lib/estimating";

const QUALIFIED_STAGES = new Set([
  "qualified",
  "estimate_started",
  "proposal_sent",
  "won",
  "scheduled",
  "completed",
]);

const STALE_STATUSES = new Set(["lost", "completed", "scheduled"]);

type MonthRevenue = { month: string; total: number };
type ServiceBreakdown = { service_type: string; count: number; revenue: number };
type EstimateRow = {
  id: string;
  project_name: string | null;
  service_type: string;
  status: string;
  total: number;
  created_at: string;
};
type SourceRow = { source: string; count: number };
type FunnelStats = {
  newLeadsThisWeek: number;
  qualificationRate: number;
  leadWinRate: number;
  avgDaysLeadToJob: number | null;
  staleLeads: number;
};

type ReportLead = Pick<Lead, "id" | "created_at" | "status" | "lead_source" | "converted_project_id" | "next_follow_up_at">;
type ReportProject = Pick<Project, "id" | "status" | "created_at">;

function isOverdue(nextFollowUpAt: string | null, status: string) {
  return !!nextFollowUpAt && !STALE_STATUSES.has(status) && new Date(nextFollowUpAt).getTime() < Date.now();
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [signedCount, setSignedCount] = useState(0);
  const [totalEstimates, setTotalEstimates] = useState(0);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalProjects, setTotalProjects] = useState(0);
  const [completeProjects, setCompleteProjects] = useState(0);
  const [avgEstimate, setAvgEstimate] = useState(0);
  const [estimateWinRate, setEstimateWinRate] = useState(0);
  const [funnelStats, setFunnelStats] = useState<FunnelStats>({
    newLeadsThisWeek: 0,
    qualificationRate: 0,
    leadWinRate: 0,
    avgDaysLeadToJob: null,
    staleLeads: 0,
  });
  const [byService, setByService] = useState<ServiceBreakdown[]>([]);
  const [recentEstimates, setRecentEstimates] = useState<EstimateRow[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthRevenue[]>([]);
  const [leadSources, setLeadSources] = useState<SourceRow[]>([]);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);

      const [
        { data: estimates },
        { data: leads },
        { count: customerCount },
        { data: projects },
      ] = await Promise.all([
        supabase.from("estimates").select("id, project_name, service_type, status, total, created_at"),
        supabase.from("leads").select("id, created_at, status, lead_source, converted_project_id, next_follow_up_at"),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id, status, created_at"),
      ]);

      const allEst = ((estimates ?? []) as EstimateRow[]).map((estimate) => ({ ...estimate, total: Number(estimate.total ?? 0) }));
      const allLeads = (leads ?? []) as ReportLead[];
      const allProjects = (projects ?? []) as ReportProject[];
      const signed = allEst.filter((estimate) => estimate.status === "signed");
      const revenue = signed.reduce((sum, estimate) => sum + (estimate.total ?? 0), 0);
      const averageEstimate = signed.length > 0 ? revenue / signed.length : 0;
      const estimatesWinRate = allEst.length > 0 ? (signed.length / allEst.length) * 100 : 0;
      const completed = allProjects.filter((project) => project.status === "complete").length;

      setTotalRevenue(revenue);
      setSignedCount(signed.length);
      setTotalEstimates(allEst.length);
      setTotalLeads(allLeads.length);
      setTotalCustomers(customerCount ?? 0);
      setTotalProjects(allProjects.length);
      setCompleteProjects(completed);
      setAvgEstimate(averageEstimate);
      setEstimateWinRate(estimatesWinRate);

      const serviceMap: Record<string, { count: number; revenue: number }> = {};
      for (const estimate of allEst) {
        const key = estimate.service_type || "Unknown";
        if (!serviceMap[key]) serviceMap[key] = { count: 0, revenue: 0 };
        serviceMap[key].count += 1;
        if (estimate.status === "signed") serviceMap[key].revenue += estimate.total ?? 0;
      }
      setByService(
        Object.entries(serviceMap)
          .map(([service_type, values]) => ({ service_type, ...values }))
          .sort((a, b) => b.revenue - a.revenue)
      );

      setRecentEstimates(
        [...allEst]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)
      );

      const months: Record<string, number> = {};
      for (let i = 11; i >= 0; i -= 1) {
        const month = new Date();
        month.setMonth(month.getMonth() - i);
        const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
        months[key] = 0;
      }
      for (const estimate of signed) {
        const month = new Date(estimate.created_at);
        const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
        if (key in months) months[key] += estimate.total ?? 0;
      }
      setMonthlyRevenue(Object.entries(months).map(([month, total]) => ({ month, total })));

      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const newLeadsThisWeek = allLeads.filter((lead) => {
        const createdAt = new Date(lead.created_at).getTime();
        return createdAt >= weekAgo && (lead.status === "new" || lead.status === "contacted");
      }).length;
      const qualifiedCount = allLeads.filter((lead) => QUALIFIED_STAGES.has(lead.status)).length;
      const qualificationRate = allLeads.length > 0 ? (qualifiedCount / allLeads.length) * 100 : 0;
      const nonLostLeads = allLeads.filter((lead) => lead.status !== "lost");
      const leadWinRate = nonLostLeads.length > 0 ? (allLeads.filter((lead) => lead.status === "won").length / nonLostLeads.length) * 100 : 0;
      const projectMap = new Map(allProjects.map((project) => [project.id, project]));
      const leadToJobDays = allLeads
        .filter((lead) => lead.converted_project_id && projectMap.has(lead.converted_project_id))
        .map((lead) => {
          const project = projectMap.get(lead.converted_project_id as string);
          return project ? (new Date(project.created_at).getTime() - new Date(lead.created_at).getTime()) / 86400000 : null;
        })
        .filter((days): days is number => typeof days === "number" && Number.isFinite(days) && days >= 0);
      const avgDaysLeadToJob = leadToJobDays.length > 0 ? leadToJobDays.reduce((sum, days) => sum + days, 0) / leadToJobDays.length : null;
      const sourceMap: Record<string, number> = {};
      for (const lead of allLeads) {
        const source = lead.lead_source?.trim() || "Unknown";
        sourceMap[source] = (sourceMap[source] ?? 0) + 1;
      }
      setLeadSources(
        Object.entries(sourceMap)
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count)
      );
      setFunnelStats({
        newLeadsThisWeek,
        qualificationRate,
        leadWinRate,
        avgDaysLeadToJob,
        staleLeads: allLeads.filter((lead) => isOverdue(lead.next_follow_up_at, lead.status)).length,
      });

      setLoading(false);
    }

    fetchAll();
  }, []);

  const maxMonthlyRev = Math.max(...monthlyRevenue.map((month) => month.total), 1);

  function fmt$(value: number) {
    return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  return (
    <>
      <div className="page-header">
        <h1>Reports & KPIs</h1>
        <p>Business performance at a glance</p>
      </div>

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
          <div className="value" style={{ color: estimateWinRate >= 50 ? "var(--success)" : "var(--warning)" }}>
            {loading ? "—" : estimateWinRate.toFixed(1) + "%"}
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

      <div className="card">
        <h2>Funnel KPIs</h2>
        <div className="stat-grid" style={{ marginBottom: 0 }}>
          <div className="stat-card">
            <div className="label">New leads this week</div>
            <div className="value">{loading ? "—" : funnelStats.newLeadsThisWeek}</div>
            <div className="sub">New + contacted this week</div>
          </div>
          <div className="stat-card">
            <div className="label">Qualification rate</div>
            <div className="value" style={{ color: "var(--success)" }}>{loading ? "—" : funnelStats.qualificationRate.toFixed(1) + "%"}</div>
            <div className="sub">Qualified and beyond / all leads</div>
          </div>
          <div className="stat-card">
            <div className="label">Lead win rate</div>
            <div className="value" style={{ color: "var(--accent)" }}>{loading ? "—" : funnelStats.leadWinRate.toFixed(1) + "%"}</div>
            <div className="sub">Won / non-lost leads</div>
          </div>
          <div className="stat-card">
            <div className="label">Avg days lead → job</div>
            <div className="value">{loading ? "—" : funnelStats.avgDaysLeadToJob == null ? "—" : funnelStats.avgDaysLeadToJob.toFixed(1)}</div>
            <div className="sub">Lead created to project created</div>
          </div>
          <div className="stat-card">
            <div className="label">Stale leads</div>
            <div className="value" style={{ color: funnelStats.staleLeads > 0 ? "var(--warning)" : "var(--text)" }}>
              {loading ? "—" : funnelStats.staleLeads}
            </div>
            <div className="sub">Past next follow-up deadline</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Leads by source</h2>
        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : leadSources.length === 0 ? (
          <div className="empty-state">No lead sources yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {leadSources.map((row) => (
                  <tr key={row.source}>
                    <td style={{ fontWeight: 600 }}>{row.source}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Revenue by month (last 12 months)</h2>
        {loading ? <p className="text-muted">Loading...</p> : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160, padding: "8px 0" }}>
            {monthlyRevenue.map((month) => {
              const pct = (month.total / maxMonthlyRev) * 100;
              return (
                <div key={month.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                    {month.total > 0 ? fmt$(month.total) : ""}
                  </div>
                  <div
                    title={`${month.month}: ${fmt$(month.total)}`}
                    style={{
                      width: "100%",
                      height: `${Math.max(pct, 2)}%`,
                      background: month.total > 0 ? "var(--accent)" : "var(--surface2)",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 0.3s",
                    }}
                  />
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {new Date(`${month.month}-15`).toLocaleDateString("en-US", { month: "short" })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                {byService.map((service) => (
                  <tr key={service.service_type}>
                    <td style={{ fontWeight: 600 }}>{serviceLabels[service.service_type as ServiceType] ?? service.service_type}</td>
                    <td className="text-muted">{service.count}</td>
                    <td style={{ fontWeight: 600, color: "var(--success)" }}>{fmt$(service.revenue)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ height: 8, borderRadius: 4, background: "var(--accent)", width: `${totalRevenue > 0 ? (service.revenue / totalRevenue) * 120 : 0}px` }} />
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                          {totalRevenue > 0 ? ((service.revenue / totalRevenue) * 100).toFixed(1) + "%" : "—"}
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
                {recentEstimates.map((estimate) => (
                  <tr key={estimate.id}>
                    <td style={{ fontWeight: 600 }}>
                      <a href={`/estimates/${estimate.id}`} style={{ color: "var(--text)", textDecoration: "none" }}>
                        {estimate.project_name ?? "—"}
                      </a>
                    </td>
                    <td className="text-muted">{estimate.service_type}</td>
                    <td>
                      <span className={`badge ${estimate.status === "signed" ? "badge-green" : estimate.status === "draft" ? "badge-yellow" : "badge-gray"}`}>
                        {estimate.status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt$(estimate.total)}</td>
                    <td className="text-muted">{new Date(estimate.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
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
