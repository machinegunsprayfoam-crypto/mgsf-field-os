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

  async function handleSave() {
    if (!result) return;
    if (!customerName.trim()) {
      setSaveMsg("⚠ Customer name is required before saving a draft estimate.");
      return;
    }

    setSaving(true);
    setSaveMsg("");

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

    const { error } = await supabase.from("estimates").insert({
      customer_id: custData.id,
      status: "draft",
      service_type: input.serviceType,
      project_name: projectName.trim() || null,
      scope_summary: notes.trim() || null,
      square_feet: input.squareFeet,
      thickness_inches: input.thicknessInches ?? 0,
      unit_price: input.unitPrice,
      material_cost: input.materialCost ?? 0,
      labor_cost: input.laborCost ?? 0,
      equipment_cost: input.equipmentCost ?? 0,
      other_cost: input.otherCost ?? 0,
      markup_percent: input.markupPercent ?? 0,
      subtotal: result.baseRevenue + result.directCost,
      total: result.total,
    });

    setSaving(false);
    if (error) {
      setSaveMsg("⚠ Estimate save failed: " + error.message);
    } else {
      setSaveMsg("✓ Klyfton saved this estimate as a draft. Owner review required before sending.");
    }
  }

  function handleReset() {
    setResult(null);
    setInput(defaultInput);
    setCustomerName("");
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
          <div className="field">
            <label>Customer name</label>
            <input
              type="text"
              placeholder="John Smith"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
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
