"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase, type Estimate, type Customer } from "@/lib/supabase";
import { serviceLabels, type ServiceType } from "@/lib/estimating";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type EstimateDetail = Estimate & {
  customers: Customer | null;
};

function ProposalText({ estimate, customer }: { estimate: EstimateDetail; customer: Customer | null }) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const customerName = customer
    ? (customer.company_name ?? [customer.first_name, customer.last_name].filter(Boolean).join(" "))
    : "Valued Customer";
  const service = serviceLabels[estimate.service_type as ServiceType] ?? estimate.service_type;
  const isFoam = ["closed_cell_spray_foam", "open_cell_spray_foam", "spf_roofing"].includes(estimate.service_type);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Header */}
      <div className="proposal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)", letterSpacing: 0.5 }}>
            ⚡ Machine Gun Spray Foam
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>
            &amp; Concrete Lifting LLC
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
            Montana &bull; Licensed &bull; Insured
          </div>
        </div>
        <div style={{ textAlign: "right", color: "var(--text-muted)", fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 15, marginBottom: 4 }}>PROPOSAL</div>
          <div>Date: {today}</div>
          {estimate.estimate_number && <div>Estimate #: {estimate.estimate_number}</div>}
        </div>
      </div>

      {/* Customer + project */}
      <div className="proposal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 6 }}>Prepared for</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{customerName}</div>
          {customer?.phone && <div style={{ color: "var(--text-muted)", fontSize: 14 }}>{customer.phone}</div>}
          {customer?.email && <div style={{ color: "var(--text-muted)", fontSize: 14 }}>{customer.email}</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 6 }}>Project</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{estimate.project_name ?? service}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Service: {service}</div>
        </div>
      </div>

      {/* Scope */}
      {estimate.scope_summary && (
        <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 8 }}>Scope of work</div>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>{estimate.scope_summary}</p>
        </div>
      )}

      {/* Measurements */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Measurements</h2>
        <div className="result-box">
          <div className="result-row">
            <span className="rlabel">Square feet</span>
            <span className="rvalue">{estimate.square_feet.toLocaleString()} SF</span>
          </div>
          {isFoam && (
            <>
              <div className="result-row">
                <span className="rlabel">Thickness</span>
                <span className="rvalue">{estimate.thickness_inches}&Prime;</span>
              </div>
              <div className="result-row">
                <span className="rlabel">Board feet</span>
                <span className="rvalue">{estimate.board_feet.toLocaleString()} BF</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Pricing summary</h2>
        <div className="result-box">
          <div className="result-row">
            <span className="rlabel">Subtotal</span>
            <span className="rvalue">{fmt(estimate.subtotal)}</span>
          </div>
          {estimate.markup_percent > 0 && (
            <div className="result-row">
              <span className="rlabel">Markup ({estimate.markup_percent}%)</span>
              <span className="rvalue">{fmt(estimate.total - estimate.subtotal)}</span>
            </div>
          )}
          <div className="result-row highlight">
            <span className="rlabel">Total investment</span>
            <span className="rvalue">{fmt(estimate.total)}</span>
          </div>
        </div>
      </div>

      {/* Terms */}
      <div className="card" style={{ marginBottom: 32 }}>
        <h2>Terms &amp; conditions</h2>
        <ul style={{ paddingLeft: 20, fontSize: 13, color: "var(--text-muted)", lineHeight: 2 }}>
          <li>50% deposit required to schedule. Remaining balance due upon completion.</li>
          <li>Price is valid for 30 days from proposal date.</li>
          <li>Customer is responsible for clearing and prepping the work area unless otherwise agreed.</li>
          <li>All work performed to manufacturer specifications and applicable building codes.</li>
          <li>Warranty per manufacturer and state licensing requirements.</li>
          <li>Changes to scope after signing may result in additional charges.</li>
        </ul>
      </div>

      {/* Signature block */}
      <div className="proposal-signature-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 40 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 40 }}>Customer signature</div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 13, color: "var(--text-muted)" }}>
            Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 40 }}>Authorized by MGSF</div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 13, color: "var(--text-muted)" }}>
            Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EstimateDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [estimate, setEstimate] = useState<EstimateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [portalLink, setPortalLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("*, customers(*)")
        .eq("id", id)
        .single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setEstimate(data as EstimateDetail);
      setLoading(false);
    })();
  }, [id]);

  async function ensurePortalLink() {
    if (!estimate) return "";
    if (portalLink) return portalLink;

    setGenerating(true);
    const { data: existing } = await supabase
      .from("portal_tokens")
      .select("token")
      .eq("estimate_id", estimate.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let token = existing?.token;
    if (!token) {
      const { data: created } = await supabase
        .from("portal_tokens")
        .insert({ estimate_id: estimate.id })
        .select("token")
        .single();
      token = created?.token;
    }

    const link = token ? `${window.location.origin}/portal/${token}` : "";
    if (link) setPortalLink(link);
    setGenerating(false);
    return link;
  }

  async function handleCopyLink() {
    const link = await ensurePortalLink();
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function updateStatus(status: string) {
    if (!estimate) return;
    setUpdatingStatus(true);
    const { error } = await supabase.from("estimates").update({ status }).eq("id", estimate.id);
    setUpdatingStatus(false);
    if (!error) {
      setEstimate((prev) => prev ? { ...prev, status } : prev);
    }
  }

  if (loading) return <p className="text-muted" style={{ padding: 32 }}>Loading...</p>;
  if (notFound || !estimate) return (
    <div style={{ padding: 32 }}>
      <p className="text-muted">Estimate not found.</p>
      <a href="/estimates" className="btn btn-ghost mt-4">← Back to estimates</a>
    </div>
  );

  return (
    <>
      <div className="page-header no-print">
        <div className="flex items-center justify-between">
          <div>
            <a href="/estimates" style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}>← Estimates</a>
            <h1 style={{ marginTop: 4 }}>{estimate.project_name ?? "Estimate"}</h1>
            <p>Proposal preview — printable</p>
          </div>
          <div className="flex gap-3">
            <a href="/estimates" className="btn btn-ghost">← Back</a>
          </div>
        </div>
      </div>

      <div className="card no-print">
        <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
            <label className="text-muted" htmlFor="estimate-status">Status</label>
            <select
              id="estimate-status"
              value={estimate.status}
              onChange={(e) => updateStatus(e.target.value)}
              disabled={updatingStatus}
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="approved">Approved</option>
              <option value="signed">Signed</option>
              <option value="declined">Declined</option>
            </select>
          </div>
          <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={() => void ensurePortalLink()} disabled={generating}>
              {generating ? "…" : "🔗 Share"}
            </button>
            <button className="btn btn-ghost" onClick={() => void handleCopyLink()} title={copied ? "Link copied" : "Copy proposal portal link"}>
              {copied ? "✓ Copied!" : "📋 Copy link"}
            </button>
            <button className="btn btn-ghost" onClick={() => window.print()}>🖨 Print proposal</button>
          </div>
        </div>
        {portalLink && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {portalLink}
          </div>
        )}
      </div>

      <div className="card">
        <ProposalText estimate={estimate} customer={estimate.customers} />
      </div>
    </>
  );
}
