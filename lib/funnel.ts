export const FUNNEL_STAGES = [
  "new",
  "contacted",
  "qualified",
  "estimate_started",
  "proposal_sent",
  "follow_up",
  "won",
  "lost",
  "scheduled",
  "completed",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_LABEL: Record<FunnelStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  estimate_started: "Estimate started",
  proposal_sent: "Proposal sent",
  follow_up: "Follow up",
  won: "Won",
  lost: "Lost",
  scheduled: "Scheduled",
  completed: "Completed",
};

export const FUNNEL_STAGE_BADGE: Record<FunnelStage, string> = {
  new: "badge-orange",
  contacted: "badge-yellow",
  qualified: "badge-green",
  estimate_started: "badge-yellow",
  proposal_sent: "badge-orange",
  follow_up: "badge-gray",
  won: "badge-green",
  lost: "badge-gray",
  scheduled: "badge-yellow",
  completed: "badge-green",
};

export const LEAD_FOLLOW_UP_RULES: Record<FunnelStage, { hours: number; label: string } | null> = {
  new: { hours: 24, label: "Contact lead within 24 hours" },
  contacted: { hours: 24, label: "Qualify lead and gather project details" },
  qualified: { hours: 48, label: "Start estimate and confirm scope" },
  estimate_started: { hours: 48, label: "Finish estimate and prepare proposal" },
  proposal_sent: { hours: 72, label: "Follow up proposal response" },
  follow_up: { hours: 48, label: "Follow up with decision maker" },
  won: { hours: 24, label: "Convert to job and schedule crew" },
  lost: null,
  scheduled: null,
  completed: null,
};

export function normalizeFunnelStage(input: string | null | undefined): FunnelStage {
  const stage = String(input ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (FUNNEL_STAGES.includes(stage as FunnelStage)) return stage as FunnelStage;
  if (stage === "in_progress" || stage === "in-progress") return "scheduled";
  if (stage === "complete") return "completed";
  return "new";
}

export function projectStatusToFunnelStage(status: string | null | undefined): FunnelStage {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "complete") return "completed";
  if (normalized === "scheduled" || normalized === "in_progress") return "scheduled";
  if (normalized === "on_hold") return "follow_up";
  return normalizeFunnelStage(normalized);
}

export function nextActionForStage(stage: FunnelStage): string {
  return LEAD_FOLLOW_UP_RULES[stage]?.label ?? "No action due";
}

