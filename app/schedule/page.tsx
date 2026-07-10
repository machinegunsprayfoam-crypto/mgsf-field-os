"use client";

import { useEffect, useState } from "react";
import { supabase, type Project } from "@/lib/supabase";

type ProjectWithCustomer = Project & {
  customers: { first_name: string | null; last_name: string | null; company_name: string | null } | null;
};

function customerName(p: ProjectWithCustomer) {
  const c = p.customers;
  if (!c) return "—";
  return (c.company_name ?? [c.first_name, c.last_name].filter(Boolean).join(" ")) || "—";
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function startDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_COLOR: Record<string, string> = {
  scheduled: "#facc15",
  in_progress: "#f97316",
  complete: "#22c55e",
  on_hold: "#8892aa",
};

export default function SchedulePage() {
  const [projects, setProjects] = useState<ProjectWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProjects() {
      setLoading(true);
      const { data } = await supabase
        .from("projects")
        .select("*, customers(first_name, last_name, company_name)")
        .order("scheduled_date", { ascending: true, nullsFirst: false });
      setProjects((data as ProjectWithCustomer[]) ?? []);
      setLoading(false);
    }
    fetchProjects();
  }, []);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
    setSelected(null);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
    setSelected(null);
  }

  const days = daysInMonth(year, month);
  const startDay = startDayOfMonth(year, month);

  function projectsOnDay(day: number): ProjectWithCustomer[] {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return projects.filter((p) => p.scheduled_date === dateStr);
  }

  const selectedProjects = selected
    ? projects.filter((p) => p.scheduled_date === selected)
    : [];

  const thisMonthProjects = projects.filter((p) => {
    if (!p.scheduled_date) return false;
    const d = new Date(p.scheduled_date + "T12:00:00");
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const unscheduled = projects.filter((p) => !p.scheduled_date && p.status !== "complete");

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Schedule</h1>
            <p>Visual calendar of scheduled projects</p>
          </div>
          <a href="/projects" className="btn btn-ghost">Manage projects →</a>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">This month</div>
          <div className="value">{loading ? "—" : thisMonthProjects.length}</div>
          <div className="sub">Jobs scheduled</div>
        </div>
        <div className="stat-card">
          <div className="label">Unscheduled</div>
          <div className="value" style={{ color: unscheduled.length > 0 ? "var(--warning)" : "var(--text)" }}>
            {loading ? "—" : unscheduled.length}
          </div>
          <div className="sub">Need a date</div>
        </div>
      </div>

      <div className="card">
        {/* Month navigation */}
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <button className="btn btn-ghost" style={{ padding: "6px 14px" }} onClick={prevMonth}>← Prev</button>
          <h2 style={{ margin: 0, fontSize: 18 }}>{MONTH_NAMES[month]} {year}</h2>
          <button className="btn btn-ghost" style={{ padding: "6px 14px" }} onClick={nextMonth}>Next →</button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", padding: "6px 0" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} style={{ minHeight: 72 }} />
          ))}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayProjects = projectsOnDay(day);
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
            const isSelected = selected === dateStr;
            return (
              <div
                key={day}
                onClick={() => setSelected(isSelected ? null : dateStr)}
                style={{
                  minHeight: 72,
                  background: isSelected ? "var(--surface2)" : "var(--bg)",
                  border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 6,
                  padding: "6px 8px",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--accent)" : "var(--text-muted)", marginBottom: 4 }}>{day}</div>
                {dayProjects.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      fontSize: 11,
                      background: STATUS_COLOR[p.status] + "22",
                      color: STATUS_COLOR[p.status],
                      borderLeft: `3px solid ${STATUS_COLOR[p.status]}`,
                      borderRadius: 3,
                      padding: "2px 4px",
                      marginBottom: 2,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.project_name}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selected && (
        <div className="card">
          <h2>
            {MONTH_NAMES[month]} {parseInt(selected.split("-")[2])}, {year}
          </h2>
          {selectedProjects.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>No projects scheduled this day.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {selectedProjects.map((p) => (
                <div key={p.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, borderLeft: `4px solid ${STATUS_COLOR[p.status]}` }}>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{p.project_name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
                    Customer: {customerName(p)}
                  </div>
                  {p.crew_lead && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>👷 Crew lead: {p.crew_lead}</div>}
                  {p.crew_notes && <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>📋 {p.crew_notes}</div>}
                  <div style={{ marginTop: 8 }}>
                    <span className="badge" style={{ background: STATUS_COLOR[p.status] + "22", color: STATUS_COLOR[p.status] }}>
                      {p.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unscheduled jobs */}
      {unscheduled.length > 0 && (
        <div className="card">
          <h2>Unscheduled jobs ({unscheduled.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {unscheduled.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.project_name}</td>
                    <td>{customerName(p)}</td>
                    <td><span className="badge badge-gray">{p.status.replace("_", " ")}</span></td>
                    <td><a href="/projects" className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}>Schedule →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
