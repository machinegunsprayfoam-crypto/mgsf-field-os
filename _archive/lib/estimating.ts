export type ServiceType =
  | "closed_cell_spray_foam"
  | "open_cell_spray_foam"
  | "spf_roofing"
  | "roof_coating"
  | "concrete_lifting"
  | "void_fill"
  | "soil_stabilization"
  | "polyurea";

export type EstimateInput = {
  serviceType: ServiceType;
  squareFeet: number;
  thicknessInches?: number;
  unitPrice: number;
  wastePercent?: number;
  laborCost?: number;
  materialCost?: number;
  equipmentCost?: number;
  otherCost?: number;
  markupPercent?: number;
};

export type EstimateResult = {
  boardFeet: number;
  adjustedQuantity: number;
  baseRevenue: number;
  directCost: number;
  markup: number;
  total: number;
  grossProfit: number;
  grossMarginPercent: number;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const safeNumber = (value: number | undefined) => Number.isFinite(value ?? 0) ? Number(value ?? 0) : 0;

export function calculateBoardFeet(squareFeet: number, thicknessInches: number): number {
  return roundMoney(safeNumber(squareFeet) * safeNumber(thicknessInches));
}

export function calculateEstimate(input: EstimateInput): EstimateResult {
  const squareFeet = safeNumber(input.squareFeet);
  const thicknessInches = safeNumber(input.thicknessInches);
  const wasteMultiplier = 1 + safeNumber(input.wastePercent) / 100;
  const unitPrice = safeNumber(input.unitPrice);

  const boardFeet = calculateBoardFeet(squareFeet, thicknessInches);
  const quantityBasis = input.serviceType === "closed_cell_spray_foam" || input.serviceType === "open_cell_spray_foam" || input.serviceType === "spf_roofing"
    ? boardFeet
    : squareFeet;

  const adjustedQuantity = roundMoney(quantityBasis * wasteMultiplier);
  const baseRevenue = roundMoney(adjustedQuantity * unitPrice);
  const directCost = roundMoney(
    safeNumber(input.materialCost) +
    safeNumber(input.laborCost) +
    safeNumber(input.equipmentCost) +
    safeNumber(input.otherCost)
  );
  const markup = roundMoney((baseRevenue + directCost) * (safeNumber(input.markupPercent) / 100));
  const total = roundMoney(baseRevenue + directCost + markup);
  const grossProfit = roundMoney(total - directCost);
  const grossMarginPercent = total > 0 ? roundMoney((grossProfit / total) * 100) : 0;

  return {
    boardFeet,
    adjustedQuantity,
    baseRevenue,
    directCost,
    markup,
    total,
    grossProfit,
    grossMarginPercent
  };
}

export const serviceLabels: Record<ServiceType, string> = {
  closed_cell_spray_foam: "Closed-cell spray foam",
  open_cell_spray_foam: "Open-cell spray foam",
  spf_roofing: "SPF roofing system",
  roof_coating: "Roof coating",
  concrete_lifting: "Concrete lifting",
  void_fill: "Void filling",
  soil_stabilization: "Soil stabilization",
  polyurea: "Polyurea coating"
};
