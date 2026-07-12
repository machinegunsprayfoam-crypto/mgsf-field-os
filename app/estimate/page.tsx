"use client";

import { useState } from "react";
import {
  calculateEstimate,
  serviceLabels,
  type ServiceType,
  type EstimateInput,
  type EstimateResult,
} from "@/lib/estimating";
import { supabase } from "@/lib/supabase";

const FOAM_SERVICES: ServiceType[] = ["closed_cell_spray_foam", "open_cell_spray_foam", "spf_roofing"];

type CustomerOption = {
  id: string;
  name: string;
  isCreate?: boolean;
};

const defaultInput: EstimateInput = {
  serviceType: "closed_cell_spray_foam",
  squareFeet: 0,
  thicknessInches: 2,
  unitPrice: 1.25,
  wastePercent: 10,
  materialCost: 0,
  laborCost: 0,
  equipmentCost: 0,
  otherCost: 0,
  markupPercent: 15,
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtNum(n: number, dec = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function splitCustomerName(customerName: string) {
  const clean = customerName.trim().replace(/\s+/g, " ");
  const nameParts = clean.split(" ");
  return {
    first_name: nameParts[0] ?? "",
    last_name: nameParts.slice(1).join(" ") || null,
  };
}

export default function EstimatePage() {
  const [input, setInput] = useState<EstimateInput>(defaultInput);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [projectName, setProjectName] = useState("");
  const [notes, setNotes] = useState("");

  const isFoam = FOAM_SERVICES.includes(input.serviceType);
  const canCalculate = input.squareFeet > 0 && input.unitPrice > 0 && (!isFoam || Number(input.thicknessInches ?? 0) > 0);

  function setField<K extends keyof EstimateInput>(key: K, value: EstimateInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
    setResult(null);
    setSaveMsg("");
  }

  function handleCalculate() {
    if (!canCalculate) {
      setSaveMsg("⚠ Enter square feet, unit price, and foam thickness before calculating.");
      return;
    }
    setResult(calculateEstimate(input));
    setSaveMsg("");
  }

  async function searchCustomers(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      setCustomerResults([]);
      return;
    }

    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name")
      .or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,company_name.ilike.%${trimmed}%`)
      .limit(5);

    const matches = (data ?? []).map((customer: { id: string; first_name: string | null; last_name: string | null; company_name: string | null }) => ({
      id: customer.id,
      name: (customer.company_name ?? [customer.first_name, customer.last_name].filter(Boolean).join(" ")) || customer.id,
    }));

    setCustomerResults([
      ...matches,
      { id: "__create__", name: `Create new: ${trimmed}`, isCreate: true },
    ]);
  }

  function handleCustomerInput(value: string) {
    setCustomerName(value);
    setCustomerId("");
    setSaveMsg("");
    void searchCustomers(value);
  }

  function selectCustomer(option: CustomerOption) {
    if (option.isCreate) {
      const rawName = option.name.replace(/^Create new:\s*/, "");
      setCustomerName(rawName);
      setCustomerId("");
    } else {
      setCustomerName(option.name);
      setCustomerId(option.id);
    }
    setCustomerResults([]);
  }

  async function handleSave() {
    if (!result) return;
    if (!customerName.trim()) {
      setSaveMsg("⚠ Customer name is required before saving a draft estimate.");
      return;
    }

    setSaving(true);
    setSaveMsg("");

    let selectedCustomerId = customerId;

    if (!selectedCustomerId) {
      const name = splitCustomerName(customerName);
      const { data: custData, error: custErr } = await supabase
        .from("customers")
        .insert(name)
        .select("id")
        .single();

      if (custErr || !custData?.id) {
        setSaving(false);
        setSaveMsg("⚠ Customer save failed: " + (custErr?.message || "No customer ID returned."));
        return;
      }

      selectedCustomerId = custData.id;
      setCustomerId(custData.id);
    }

    const { data: estimateData, error } = await supabase.from("estimates").insert({
      customer_id: selectedCustomerId,
      status: "draft",
      service_type: input.serviceType,
      project_name: projectName.trim() || null,
      scope_summary: notes.trim() || null,
      square_feet: input.squareFeet,
      thickness_inches: input.thicknessInches ?? 0,
      board_feet: result.boardFeet,
      unit_price: input.unitPrice,
      material_cost: input.materialCost ?? 0,
      labor_cost: input.laborCost ?? 0,
      equipment_cost: input.equipmentCost ?? 0,
      other_cost: input.otherCost ?? 0,
      markup_percent: input.markupPercent ?? 0,
      subtotal: result.baseRevenue + result.directCost,
      total: result.total,
    }).select("id").single();

    if (error) {
      setSaving(false);
      setSaveMsg("⚠ Estimate save failed: " + error.message);
      return;
    }

    if (!estimateData?.id) {
      setSaving(false);
      setSaveMsg("⚠ Estimate saved, but no estimate ID was returned for number generation.");
      return;
    }

    const estimateNumber = `EST-${Date.now()}`;
    const { error: estimateNumberError } = await supabase
      .from("estimates")
      .update({ estimate_number: estimateNumber })
      .eq("id", estimateData.id);

    setSaving(false);
    if (estimateNumberError) {
      setSaveMsg("⚠ Estimate saved, but estimate number generation failed: " + estimateNumberError.message);
    } else {
      setSaveMsg(`✓ Klyfton saved this estimate as draft ${estimateNumber}. Owner review required before sending.`);
    }
  }

  function handleReset() {
    setResult(null);
    setInput(defaultInput);
    setCustomerName("");
    setCustomerId("");
    setCustomerResults([]);
    setProjectName("");
    setNotes("");
    setSaveMsg("");
  }

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Klyfton AI Estimator</h1>
            <p>Estimator-only pricing tool for Machine Gun Spray Foam &amp; Concrete Lifting.</p>
          </div>
          <a href="/estimates" className="btn btn-ghost">Estimate history</a>
        </div>
      </div>

      <div className="card" style={{ borderColor: "rgba(249,115,22,.35)", marginBottom: 18 }}>
        <h2>Draft-only guardrail</h2>
        <p className="text-muted">
          Klyfton can calculate and save draft estimates. Final customer pricing still requires owner approval before it becomes a quote or proposal.
        </p>
      </div>

      <div className="card">
        <h2>Job info</h2>
        <div className="form-grid">
          <div className="field" style={{ position: "relative" }}>
            <label>Search existing customer</label>
            <input
              type="text"
              placeholder="Search by customer or company name"
              value={customerName}
              onChange={(e) => handleCustomerInput(e.target.value)}
            />
            {customerResults.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, zIndex: 20, marginTop: 2 }}>
                {customerResults.map((customer) => (
                  <div
                    key={`${customer.id}-${customer.name}`}
                    onClick={() => selectCustomer(customer)}
                    style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    {customer.name}
                  </div>
                ))}
              </div>
            )}
            <span className="text-muted">
              {customerId ? "Using existing customer record." : "No match? Keep typing and save to create a new customer."}
            </span>
          </div>
          <div className="field">
            <label>Project name</label>
            <input
              type="text"
              placeholder="Crawl space — 123 Main St"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div className="field cols-1">
            <label>Scope / notes</label>
            <textarea
              placeholder="Describe the work, access conditions, substrate, special requirements, photos needed, and assumptions."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Service &amp; measurements</h2>
        <div className="form-grid cols-3">
          <div className="field">
            <label>Service type</label>
            <select
              value={input.serviceType}
              onChange={(e) => setField("serviceType", e.target.value as ServiceType)}
            >
              {(Object.entries(serviceLabels) as [ServiceType, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Square feet</label>
            <input
              type="number"
              min={0}
              value={input.squareFeet || ""}
              onChange={(e) => setField("squareFeet", parseFloat(e.target.value) || 0)}
            />
          </div>
          {isFoam && (
            <div className="field">
              <label>Thickness (inches)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={input.thicknessInches ?? ""}
                onChange={(e) => setField("thicknessInches", parseFloat(e.target.value) || 0)}
              />
            </div>
          )}
          <div className="field">
            <label>{isFoam ? "Unit price (per board ft)" : "Unit price (per sq ft)"}</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={input.unitPrice || ""}
              onChange={(e) => setField("unitPrice", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Waste % / overage</label>
            <input
              type="number"
              min={0}
              max={100}
              value={input.wastePercent ?? ""}
              onChange={(e) => setField("wastePercent", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Markup %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={input.markupPercent ?? ""}
              onChange={(e) => setField("markupPercent", parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Direct costs</h2>
        <div className="form-grid cols-3">
          {[
            { key: "materialCost" as const, label: "Material cost ($)" },
            { key: "laborCost" as const, label: "Labor cost ($)" },
            { key: "equipmentCost" as const, label: "Equipment cost ($)" },
            { key: "otherCost" as const, label: "Other cost ($)" },
          ].map(({ key, label }) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={input[key] ?? ""}
                onChange={(e) => setField(key, parseFloat(e.target.value) || 0)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <button className="btn btn-primary" onClick={handleCalculate} disabled={!canCalculate}>
          Calculate estimate
        </button>
        <button className="btn btn-ghost" onClick={handleReset}>
          Reset
        </button>
      </div>
      {saveMsg && <p className="text-muted mt-4">{saveMsg}</p>}

      {result && (
        <div className="card mt-6">
          <h2>Estimate results</h2>
          <div className="result-box">
            {isFoam && (
              <div className="result-row">
                <span className="rlabel">Board feet before waste</span>
                <span className="rvalue">{fmtNum(result.boardFeet)} BF</span>
              </div>
            )}
            <div className="result-row">
              <span className="rlabel">Adjusted quantity with waste</span>
              <span className="rvalue">
                {fmtNum(result.adjustedQuantity)} {isFoam ? "BF" : "SF"}
              </span>
            </div>
            <div className="result-row">
              <span className="rlabel">Base revenue</span>
              <span className="rvalue">{fmt(result.baseRevenue)}</span>
            </div>
            <div className="result-row">
              <span className="rlabel">Direct cost</span>
              <span className="rvalue">{fmt(result.directCost)}</span>
            </div>
            <div className="result-row">
              <span className="rlabel">Markup</span>
              <span className="rvalue">{fmt(result.markup)}</span>
            </div>
            <div className="result-row highlight">
              <span className="rlabel">Draft total price</span>
              <span className="rvalue">{fmt(result.total)}</span>
            </div>
            <div className="result-row profit">
              <span className="rlabel">Gross profit</span>
              <span className="rvalue">{fmt(result.grossProfit)} ({fmtNum(result.grossMarginPercent, 1)}%)</span>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save draft estimate"}
            </button>
            <button className="btn btn-ghost" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>
      )}
    </>
  );
}
