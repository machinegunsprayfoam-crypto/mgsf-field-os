import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type Params = { token: string };

async function getPortalData(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);

  // Get token record
  const { data: tokenRow } = await supabase
    .from("portal_tokens")
    .select("*, estimates(*, customers(first_name, last_name, company_name, email, phone))")
    .eq("token", token)
    .single();

  if (!tokenRow) return null;

  // Check expiry
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) return "expired";

  // Mark as viewed
  if (!tokenRow.viewed_at) {
    await supabase.from("portal_tokens").update({ viewed_at: new Date().toISOString() }).eq("token", token);
  }

  return tokenRow;
}

export default async function PortalPage({ params }: { params: Params }) {
  const data = await getPortalData(params.token);

  if (!data) return notFound();

  if (data === "expired") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa", padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Link expired</h1>
          <p style={{ color: "#6b7280" }}>This proposal link has expired. Please contact Machine Gun Spray Foam & Concrete Lifting for a new link.</p>
          <p style={{ marginTop: 16 }}><a href="https://www.machinegunsprayfoam.info" style={{ color: "#f97316" }}>machinegunsprayfoam.info</a></p>
        </div>
      </div>
    );
  }

  const estimate = data.estimates;
  const customer = estimate?.customers;

  function customerName() {
    if (!customer) return "";
    return customer.company_name ?? [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  }

  function fmt$(n: number) {
    return "$" + (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh", padding: "40px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 32, marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div className="proposal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingBottom: 24, borderBottom: "2px solid #f97316" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#f97316" }}>⚡ MGSF</div>
              <div style={{ fontSize: 14, color: "#6b7280", marginTop: 2 }}>Machine Gun Spray Foam & Concrete Lifting LLC</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>Montana · Wyoming · North / South Dakota</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>machinegunsprayfoam.info</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Proposal</div>
              {estimate?.estimate_number && (
                <div style={{ fontSize: 13, color: "#6b7280" }}>#{estimate.estimate_number}</div>
              )}
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {new Date(estimate?.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#9ca3af", marginBottom: 6 }}>Prepared for</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>{customerName()}</div>
              {customer?.email && <div style={{ fontSize: 13, color: "#6b7280" }}>{customer.email}</div>}
              {customer?.phone && <div style={{ fontSize: 13, color: "#6b7280" }}>{customer.phone}</div>}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#9ca3af", marginBottom: 6 }}>Project</div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#111" }}>{estimate?.project_name ?? estimate?.service_type}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{estimate?.service_type}</div>
            </div>
          </div>
        </div>

        {/* Scope */}
        {estimate?.scope_summary && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#111" }}>Scope of work</h2>
            <p style={{ color: "#374151", lineHeight: 1.7 }}>{estimate.scope_summary}</p>
          </div>
        )}

        {/* Measurements */}
        {(estimate?.square_feet > 0 || estimate?.thickness_inches > 0) && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#111" }}>Measurements</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {estimate.square_feet > 0 && (
                <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>{estimate.square_feet.toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Square feet</div>
                </div>
              )}
              {estimate.thickness_inches > 0 && (
                <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>{estimate.thickness_inches}&quot;</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Thickness</div>
                </div>
              )}
              {estimate.board_feet > 0 && (
                <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>{estimate.board_feet.toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Board feet</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pricing */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 28, marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#111" }}>Investment summary</h2>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            {[
              estimate?.material_cost > 0 && { label: "Materials", value: fmt$(estimate.material_cost) },
              estimate?.labor_cost > 0 && { label: "Labor", value: fmt$(estimate.labor_cost) },
              estimate?.equipment_cost > 0 && { label: "Equipment", value: fmt$(estimate.equipment_cost) },
              estimate?.other_cost > 0 && { label: "Other", value: fmt$(estimate.other_cost) },
              { label: "Subtotal", value: fmt$(estimate?.subtotal ?? 0), bold: true },
            ].filter(Boolean).map((row, i) => row && (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontSize: 14 }}>
                <span style={{ color: "#6b7280", fontWeight: row.bold ? 600 : 400 }}>{row.label}</span>
                <span style={{ fontWeight: row.bold ? 700 : 500, color: "#111" }}>{row.value}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "18px 16px", background: "#f97316", color: "#fff" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{fmt$(estimate?.total ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Measurement notes */}
        {estimate?.measurement_notes && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#111" }}>Notes & assumptions</h2>
            <p style={{ color: "#374151", lineHeight: 1.7, fontSize: 14 }}>{estimate.measurement_notes}</p>
          </div>
        )}

        {/* CTA */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#111" }}>Ready to get started?</h2>
          <p style={{ color: "#6b7280", marginBottom: 20, fontSize: 14 }}>
            Contact us to accept this proposal and schedule your project.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="tel:+1" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", background: "#f97316", color: "#fff", borderRadius: 8, fontWeight: 700, textDecoration: "none", fontSize: 15 }}>
              📞 Call us
            </a>
            <a href="https://www.machinegunsprayfoam.info" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", background: "#f9fafb", color: "#111", border: "1px solid #e5e7eb", borderRadius: 8, fontWeight: 600, textDecoration: "none", fontSize: 15 }}>
              🌐 Our website
            </a>
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 20 }}>
            This proposal is valid for 30 days from the date above. Prices subject to change based on material costs and site conditions.
          </p>
        </div>
      </div>
    </div>
  );
}
