"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, type Lead, type Project } from "@/lib/supabase";

type CustomerSummary = { first_name: string | null; last_name: string | null; company_name: string | null };

type ProjectWithCustomer = Pick<Project, "id" | "project_name" | "scheduled_date" | "crew_lead" | "status"> & {
  customers: CustomerSummary | CustomerSummary[] | null;
};

type DashboardLead = Lead & {
  next_follow_up_at?: string | null;
};

type DashboardState = {
  newLeadsThisWeek: number | null;
  overdueFollowUps: number | null;
  activeProjects: number | null;
  jobsTodayCount: number | null;
  equipmentDue: number | null;
  lowInventory: number | null;
  upcomingProposals: number | null;
  revenueMtd: number | null;
  todayJobs: ProjectWithCustomer[];
  upcomingWeek: Pick<Project, "id" | "project_name" | "scheduled_date">[];
  recentLeads: DashboardLead[];
};

const EMPTY_DASHBOARD: DashboardState = {
  newLeadsThisWeek: null,
  overdueFollowUps: null,
  activeProjects: null,
  jobsTodayCount: null,
  equipmentDue: null,
  lowInventory: null,
  upcomingProposals: null,
  revenueMtd: null,
  todayJobs: [],
  upcomingWeek: [],
  recentLeads: [],
};

const STATUS_BADGES: Record<string, string> = {
  new: "badge-orange",
  contacted: "badge-yellow",
  qualified: "badge-green",
  won: "badge-green",
  signed: "badge-green",
  lost: "badge-gray",
  completed: "badge-green",
  scheduled: "badge-yellow",
};

const FUNNEL_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  signed: "Signed",
  lost: "Lost",
  completed: "Completed",
  scheduled: "Scheduled",
};

const NEXT_ACTIONS: Record<string, string> = {
  new: "Call today",
  contacted: "Send estimate",
  qualified: "Book site visit",
  won: "Prep kickoff",
  signed: "Move to project",
  lost: "Archive",
};

function customerRecord(project: ProjectWithCustomer) {
  return Array.isArray(project.customers) ? project.customers[0] ?? null : project.customers;
}

function customerName(project: ProjectWithCustomer) {
  const customer = customerRecord(project);
  if (!customer) return "—";
  return (customer.company_name ?? [customer.first_name, customer.last_name].filter(Boolean).join(" ")) || "—";
}

function leadName(lead: Lead) {
  return (lead.company_name ?? [lead.first_name, lead.last_name].filter(Boolean).join(" ")) || "—";
}

function currency(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

async function fetchOverdueFollowUps(nowIso: string) {
  const primary = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .not("status", "in", '("lost","completed","scheduled")')
    .lt("next_follow_up_at", nowIso);

  if (!primary.error) return primary.count ?? 0;

  // Fallback for schemas that have not added next_follow_up_at yet: treat brand-new leads as the
  // contact-today queue so the dashboard still surfaces work instead of showing a silent zero.
  const fallback = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  if (fallback.error) {
    throw fallback.error;
  }

  return fallback.count ?? 0;
}

export default function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardState>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [dismissed, setDismissed] = useState<string[]>([]);

  const today = useMemo(() => new Date(), []);
  const todayText = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  useEffect(() => {
    let alive = true;

    async function fetchDashboard() {
      setLoading(true);
      setNotice("");

      try {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAhead = new Date(now);
        weekAhead.setDate(weekAhead.getDate() + 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [newLeadsResult, overdueFollowUps, activeProjectsResult, todayJobsResult, equipmentResult, inventoryResult, proposalsResult, revenueResult, upcomingWeekResult, recentLeadsResult] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
          fetchOverdueFollowUps(now.toISOString()),
          supabase.from("projects").select("id", { count: "exact", head: true }).in("status", ["scheduled", "in_progress"]),
          supabase
            .from("projects")
            .select("id, project_name, scheduled_date, crew_lead, status, customers(first_name, last_name, company_name)")
            .eq("scheduled_date", todayStr)
            .order("project_name"),
          supabase.from("equipment").select("id", { count: "exact", head: true }).lte("next_service_date", weekAhead.toISOString().slice(0, 10)),
          supabase.from("inventory_items").select("id, quantity_on_hand, reorder_point"),
          supabase.from("estimates").select("id", { count: "exact", head: true }).eq("status", "sent"),
          supabase.from("estimates").select("total").eq("status", "signed").gte("created_at", monthStart.toISOString()),
          supabase
            .from("projects")
            .select("id, project_name, scheduled_date")
            .gte("scheduled_date", todayStr)
            .lte("scheduled_date", weekAhead.toISOString().slice(0, 10))
            .order("scheduled_date", { ascending: true }),
          supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(5),
        ]);

        const errors = [
          newLeadsResult.error,
          activeProjectsResult.error,
          todayJobsResult.error,
          equipmentResult.error,
          inventoryResult.error,
          proposalsResult.error,
          revenueResult.error,
          upcomingWeekResult.error,
          recentLeadsResult.error,
        ].filter(Boolean);

        if (errors.length > 0) {
          throw errors[0];
        }

        const revenueMtd = (revenueResult.data ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0);
        const lowInventory = (inventoryResult.data ?? []).filter((item) => Number(item.quantity_on_hand ?? 0) <= Number(item.reorder_point ?? 0)).length;
        const todayJobs = ((todayJobsResult.data ?? []) as unknown as ProjectWithCustomer[]);
        const upcomingWeek = ((upcomingWeekResult.data as Pick<Project, "id" | "project_name" | "scheduled_date">[] | null) ?? [])
          .filter((project) => project.scheduled_date && project.scheduled_date > todayStr)
          .slice(0, 7);

        if (!alive) return;

        setDashboard({
          newLeadsThisWeek: newLeadsResult.count ?? 0,
          overdueFollowUps,
          activeProjects: activeProjectsResult.count ?? 0,
          jobsTodayCount: todayJobs.length,
          equipmentDue: equipmentResult.count ?? 0,
          lowInventory,
          upcomingProposals: proposalsResult.count ?? 0,
          revenueMtd,
          todayJobs,
          upcomingWeek,
          recentLeads: (recentLeadsResult.data as DashboardLead[] | null) ?? [],
        });
      } catch {
        if (!alive) return;
        setDashboard(EMPTY_DASHBOARD);
        setNotice("Connect Supabase to see live data.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchDashboard();
    return () => {
      alive = false;
    };
  }, []);

  const alerts = [
    {
      key: "overdue",
      borderColor: "rgba(239,68,68,0.45)",
      background: "rgba(239,68,68,0.10)",
      count: dashboard.overdueFollowUps ?? 0,
      message: `${dashboard.overdueFollowUps ?? 0} leads need contact today`,
    },
    {
      key: "service",
      borderColor: "rgba(250,204,21,0.45)",
      background: "rgba(250,204,21,0.10)",
      count: dashboard.equipmentDue ?? 0,
      message: `${dashboard.equipmentDue ?? 0} pieces of equipment need service`,
    },
    {
      key: "inventory",
      borderColor: "rgba(249,115,22,0.45)",
      background: "rgba(249,115,22,0.10)",
      count: dashboard.lowInventory ?? 0,
      message: `${dashboard.lowInventory ?? 0} items below reorder point`,
    },
    {
      key: "proposals",
      borderColor: "rgba(249,115,22,0.45)",
      background: "rgba(249,115,22,0.10)",
      count: dashboard.upcomingProposals ?? 0,
      message: `${dashboard.upcomingProposals ?? 0} proposals sent — follow up`,
    },
  ].filter((alert) => alert.count > 0 && !dismissed.includes(alert.key));

  return (
    <>
      <div className="page-header">
        <div
          className="flex items-center justify-between"
          style={{ gap: 16, flexWrap: "wrap" }}
        >
          <div>
            <h1>Field Command</h1>
            <p>{todayText}</p>
          </div>
          <a className="btn btn-ghost" href="tel:4069398301">
            406-939-8301
          </a>
        </div>
      </div>

      {notice && (
        <div
          className="card"
          style={{ marginBottom: 20, borderColor: "rgba(249,115,22,0.45)", background: "rgba(249,115,22,0.08)" }}
        >
          <strong>Live data offline.</strong> <span className="text-muted">{notice}</span>
        </div>
      )}

      {alerts.length > 0 && (
        <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
          {alerts.map((alert) => (
            <div
              key={alert.key}
              className="card"
              style={{
                marginBottom: 0,
                padding: "14px 18px",
                borderColor: alert.borderColor,
                background: alert.background,
              }}
            >
              <div className="flex items-center justify-between" style={{ gap: 12 }}>
                <div style={{ fontWeight: 600 }}>{alert.message}</div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "6px 10px", fontSize: 12 }}
                  onClick={() => setDismissed((current) => [...current, alert.key])}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Today&apos;s jobs</div>
          <div className="value">{loading ? "—" : dashboard.jobsTodayCount ?? 0}</div>
          <div className="sub">Crew on deck</div>
        </div>
        <div className="stat-card">
          <div className="label">Active pipeline</div>
          <div className="value">{loading ? "—" : dashboard.activeProjects ?? 0}</div>
          <div className="sub">Scheduled + in progress</div>
        </div>
        <div className="stat-card">
          <div className="label">New leads this week</div>
          <div className="value">{loading ? "—" : dashboard.newLeadsThisWeek ?? 0}</div>
          <div className="sub">Fresh opportunities</div>
        </div>
        <div className="stat-card">
          <div className="label">Revenue MTD</div>
          <div className="value" style={{ color: "var(--success)", fontSize: 24 }}>
            {loading ? "—" : currency(dashboard.revenueMtd)}
          </div>
          <div className="sub">Signed estimates this month</div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <h2 style={{ marginBottom: 0 }}>Quick actions</h2>
          <span className="text-muted">Fast jumps for the front office</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {[
            { href: "/leads", label: "📋 New Lead" },
            { href: "/estimate", label: "⚡ New Estimate" },
            { href: "/photos", label: "📷 Log Photos" },
          ].map((action) => (
            <a
              key={action.href}
              href={action.href}
              className="btn btn-ghost"
              style={{ justifyContent: "center", minHeight: 72, fontSize: 18 }}
            >
              {action.label}
            </a>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <div className="card">
          <h2>Today&apos;s jobs</h2>
          {dashboard.todayJobs.length === 0 ? (
            <div className="empty-state">No jobs scheduled today</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Customer</th>
                    <th>Crew lead</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.todayJobs.map((project) => (
                    <tr key={project.id}>
                      <td style={{ fontWeight: 600 }}>{project.project_name}</td>
                      <td>{customerName(project)}</td>
                      <td>{project.crew_lead ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Upcoming this week</h2>
          {dashboard.upcomingWeek.length === 0 ? (
            <div className="empty-state">Nothing else on the calendar this week.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Project</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.upcomingWeek.map((project) => (
                    <tr key={project.id}>
                      <td>{project.scheduled_date ? dateLabel(project.scheduled_date) : "—"}</td>
                      <td style={{ fontWeight: 600 }}>{project.project_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginBottom: 0 }}>Pipeline at a glance</h2>
          <a href="/leads" className="btn btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }}>
            Open leads
          </a>
        </div>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Service</th>
                <th>Status</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentLeads.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">No leads in the pipeline yet.</div>
                  </td>
                </tr>
              ) : (
                dashboard.recentLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: 600 }}>{leadName(lead)}</td>
                    <td>{lead.service_interest ?? "—"}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGES[lead.status] ?? "badge-gray"}`}>
                        {FUNNEL_LABELS[lead.status] ?? lead.status}
                      </span>
                    </td>
                    <td>
                      {lead.next_follow_up_at
                        ? `Follow up ${new Date(lead.next_follow_up_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                        : NEXT_ACTIONS[lead.status] ?? "Review notes"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
