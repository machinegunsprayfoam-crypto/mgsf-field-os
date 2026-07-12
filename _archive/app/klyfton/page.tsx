"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, type Lead, type Project } from "@/lib/supabase";

type CustomerSummary = { first_name: string | null; last_name: string | null; company_name: string | null };

type ProjectWithCustomer = Pick<Project, "id" | "project_name" | "status" | "scheduled_date" | "crew_lead" | "internal_notes"> & {
  customers: CustomerSummary | CustomerSummary[] | null;
};

type ChatAction = {
  type: string;
  [key: string]: unknown;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  specialist?: string;
  action?: ChatAction | null;
  actionState?: "pending" | "confirmed" | "dismissed";
};

const SPECIALISTS = [
  { id: "estimator", label: "Estimator" },
  { id: "conditions", label: "Spray-Conditions" },
  { id: "materials", label: "Materials" },
  { id: "safety", label: "Safety/JSA" },
  { id: "ops", label: "Ops" },
  { id: "proposal", label: "Proposal-Drafter" },
  { id: "crm", label: "CRM/FollowUp" },
  { id: "inventory", label: "Inventory/Ordering" },
  { id: "reporting", label: "Reporting/KPI" },
  { id: "govcon", label: "GovCon" },
  { id: "marketing", label: "Marketing" },
  { id: "hunter", label: "Lead-Hunter" },
  { id: "general", label: "Klyfton" },
] as const;
const MEMORY_MAX = 500;
const MEMORY_PROMPT_WINDOW = 20;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function customerRecord(project: ProjectWithCustomer) {
  return Array.isArray(project.customers) ? project.customers[0] ?? null : project.customers;
}

function customerName(project: ProjectWithCustomer) {
  const customer = customerRecord(project);
  if (!customer) return "Unknown customer";
  return (customer.company_name ?? [customer.first_name, customer.last_name].filter(Boolean).join(" ")) || "Unknown customer";
}

function leadName(lead: Lead) {
  return (lead.company_name ?? [lead.first_name, lead.last_name].filter(Boolean).join(" ")) || "Unnamed lead";
}

function normalizeSpecialist(value: string) {
  const map: Record<string, string> = {
    "CRM-FollowUp": "CRM/FollowUp",
    "Inventory-Ordering": "Inventory/Ordering",
    "Reporting-KPI": "Reporting/KPI",
    "GovCon-Hunter": "GovCon",
  };

  return value
    .split(",")
    .map((part) => map[part.trim()] ?? part.trim())
    .join(" · ");
}

function parseActionResponse(rawReply: string) {
  const match = rawReply.match(/\[\[ACTION\]\]([\s\S]*?)\[\[\/ACTION\]\]/i);
  if (!match) return { reply: rawReply.trim(), action: null as ChatAction | null };

  let action: ChatAction | null = null;
  try {
    action = JSON.parse(match[1]);
  } catch {
    action = null;
  }

  return {
    reply: rawReply.replace(match[0], "").trim(),
    action,
  };
}

export default function KlyftonPage() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [selectedSpecialist, setSelectedSpecialist] = useState<(typeof SPECIALISTS)[number]["id"]>("general");
  const [activeSpecialist, setActiveSpecialist] = useState("Klyfton");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: "assistant",
      specialist: "Klyfton",
      content: "Ask about estimates, crews, follow-ups, inventory, safety, or proposals.",
    },
  ]);
  const [memory, setMemory] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const selectedLabel = useMemo(
    () => SPECIALISTS.find((specialist) => specialist.id === selectedSpecialist)?.label ?? "Klyfton",
    [selectedSpecialist]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function fetchContext() {
    try {
      const [leadResult, projectResult] = await Promise.all([
        supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(10),
        supabase
          .from("projects")
          .select("id, project_name, status, scheduled_date, crew_lead, internal_notes, customers(first_name, last_name, company_name)")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (leadResult.error) throw leadResult.error;
      if (projectResult.error) throw projectResult.error;

      const leads = ((leadResult.data as Lead[] | null) ?? []).map((lead) => ({
        id: lead.id,
        name: leadName(lead),
        status: lead.status,
        service: lead.service_interest ?? "",
        state: lead.state ?? "",
        phone: lead.phone ?? "",
        town: lead.city ?? "",
        source: lead.lead_source ?? "",
        notes: lead.notes ?? "",
      }));

      const jobs = (((projectResult.data ?? []) as unknown as ProjectWithCustomer[])).map((project) => ({
        id: project.id,
        customer: customerName(project),
        service: project.project_name,
        status: project.status,
        date: project.scheduled_date ?? "",
        crew: project.crew_lead ?? "",
        next: project.internal_notes ?? "",
      }));

      return { leads, jobs };
    } catch {
      return { leads: [], jobs: [] };
    }
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: trimmed,
    };

    const history = messages.map((message) => ({ role: message.role, content: message.content }));
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSending(true);
    setError("");

    try {
      const { leads, jobs } = await fetchContext();
      const effectiveMessage =
        selectedSpecialist === "general"
          ? trimmed
          : `Use the ${selectedLabel} specialist unless another mind is strictly required.\n\n${trimmed}`;

      const response = await fetch("/api/klyfton", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg: effectiveMessage,
          message: effectiveMessage,
          role: "admin",
          history,
          memory: memory.slice(-MEMORY_PROMPT_WINDOW),
          context: {
            leads,
            jobs,
            memory: memory.slice(-MEMORY_PROMPT_WINDOW),
            userRole: "admin",
            leadRecords: leads,
            jobRecords: jobs,
            company: "Machine Gun Spray Foam & Concrete Lifting, LLC",
            activeJobs: jobs.filter((job) => ["scheduled", "in_progress"].includes(job.status)).length,
            openLeads: leads.filter((lead) => lead.status !== "lost").length,
          },
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        text?: string;
        action?: ChatAction | null;
        specialist?: string;
        minds?: string[];
        remember?: string[];
      };

      const rawReply = typeof data.reply === "string" ? data.reply : typeof data.text === "string" ? data.text : "No reply returned.";
      const parsed = parseActionResponse(rawReply);
      const specialist = normalizeSpecialist(
        data.specialist ?? (Array.isArray(data.minds) && data.minds.length > 0 ? data.minds.join(", ") : selectedLabel)
      );
      const remember = Array.isArray(data.remember) ? data.remember.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

      if (remember.length > 0) {
        setMemory((current) => [...current, ...remember].slice(-MEMORY_MAX));
      }

      setActiveSpecialist(specialist);
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          specialist,
          content: parsed.reply || "No reply returned.",
          action: data.action ?? parsed.action,
          actionState: data.action ?? parsed.action ? "pending" : undefined,
        },
      ]);
    } catch (fetchError) {
      const fallback = "Klyfton hit a snag on this request. Try again in a moment.";
      setError(fallback);
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          specialist: "Klyfton",
          content: fallback,
        },
      ]);
      if (fetchError instanceof Error && fetchError.message) {
        setError(fetchError.message);
      }
    } finally {
      setSending(false);
    }
  }

  function updateActionState(messageId: string, actionState: "confirmed" | "dismissed") {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              actionState,
            }
          : message
      )
    );
  }

  return (
    <>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="flex items-center justify-between" style={{ gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1>⚡ Klyfton AI</h1>
            <p>Internal field assistant — admin mode</p>
          </div>
          <span className="badge badge-orange" style={{ fontSize: 13, padding: "6px 12px" }}>
            {activeSpecialist}
          </span>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 0,
          padding: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "260px minmax(0, 1fr)",
          minHeight: "calc(100vh - 170px)",
        }}
      >
        <aside style={{ borderRight: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", padding: 18 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-muted)", marginBottom: 12 }}>
            Specialist selector
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {SPECIALISTS.map((specialist) => {
              const active = specialist.id === selectedSpecialist;
              return (
                <button
                  key={specialist.id}
                  type="button"
                  className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSelectedSpecialist(specialist.id)}
                  style={{ justifyContent: "flex-start", width: "100%", padding: "10px 12px" }}
                >
                  {specialist.label}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Ctrl+K focuses the prompt. Enter sends. Shift+Enter adds a new line.
          </div>
        </aside>

        <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: 20, display: "grid", gap: 14 }}>
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div key={message.id} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "min(720px, 92%)", display: "grid", gap: 8 }}>
                    {!isUser && message.specialist && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", paddingLeft: 4 }}>{message.specialist}</div>
                    )}
                    <div
                      style={{
                        background: isUser ? "var(--accent)" : "var(--surface2)",
                        color: "var(--text)",
                        border: `1px solid ${isUser ? "transparent" : "var(--border)"}`,
                        borderRadius: 14,
                        padding: "14px 16px",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                      }}
                    >
                      {message.content}
                    </div>
                    {message.action && message.actionState !== "dismissed" && (
                      <div
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: 14,
                        }}
                      >
                        <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 10 }}>
                          <strong style={{ fontSize: 14 }}>Action: {message.action.type}</strong>
                          {message.actionState === "confirmed" && (
                            <span style={{ color: "var(--success)", fontSize: 13 }}>✓ Logged (review in app)</span>
                          )}
                        </div>
                        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                          {Object.entries(message.action)
                            .filter(([key]) => key !== "type")
                            .map(([key, value]) => (
                              <div key={key} style={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)", gap: 10, fontSize: 13 }}>
                                <span style={{ color: "var(--text-muted)", textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</span>
                                <span style={{ whiteSpace: "pre-wrap" }}>
                                  {typeof value === "string" ? value : JSON.stringify(value)}
                                </span>
                              </div>
                            ))}
                        </div>
                        {message.actionState !== "confirmed" && (
                          <div className="flex gap-3">
                            <button className="btn btn-primary" type="button" onClick={() => updateActionState(message.id, "confirmed")}>
                              Confirm
                            </button>
                            <button className="btn btn-ghost" type="button" onClick={() => updateActionState(message.id, "dismissed")}>
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {sending && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px" }}>
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", padding: 16, background: "var(--surface)" }}>
            {error && <div style={{ color: "var(--warning)", fontSize: 13, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={`Message ${selectedLabel}...`}
                style={{
                  minHeight: 88,
                  maxHeight: 220,
                  resize: "vertical",
                  background: "var(--bg)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  font: "inherit",
                }}
              />
              <button className="btn btn-primary" type="button" disabled={sending || !input.trim()} onClick={() => void sendMessage()}>
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
