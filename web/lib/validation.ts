import type { SteelInput } from "./api";
import { COMPOSITION_FIELDS, getFieldValue } from "./fieldConfig";

export type WarningLevel = "info" | "warning" | "error";

export interface InputWarning {
  id: string;
  level: WarningLevel;
  message: string;
  field?: keyof SteelInput | "composition";
}

function carbonEquivalent(input: SteelInput): number {
  const { C, Mn, Cr, Mo, V, Ni, Cu } = input;
  return C + Mn / 6 + (Cr + Mo + V) / 5 + (Ni + Cu) / 15;
}

function totalAlloy(input: SteelInput): number {
  return input.Mn + input.Cr + input.Mo + input.Ni + input.Si + input.V + input.Cu + input.Al;
}

function carbideFormers(input: SteelInput): number {
  return input.Cr + input.Mo + input.V;
}

export function computeInputWarnings(input: SteelInput): InputWarning[] {
  const warnings: InputWarning[] = [];

  for (const field of COMPOSITION_FIELDS) {
    const value = getFieldValue(input, field.key);
    if (value < field.typicalMin || value > field.typicalMax) {
      warnings.push({
        id: `range-${field.key}`,
        level: "warning",
        field: field.key,
        message: `${field.label} (${value}${field.unit ? ` ${field.unit}` : ""}) is outside the typical training range (${field.typicalMin}–${field.typicalMax}${field.unit ? ` ${field.unit}` : ""}). Predictions may be less reliable.`,
      });
    }
  }

  const aus = input.austenitize_T;
  const temper = input.temper_T;
  if (aus != null && temper != null && aus <= temper) {
    warnings.push({
      id: "aus-temper-order",
      level: "error",
      field: "austenitize_T",
      message: "Austenitizing temperature should be higher than tempering temperature. This heat-treatment sequence is physically inconsistent.",
    });
  }

  const alloyTotal = totalAlloy(input);
  if (alloyTotal > 35) {
    warnings.push({
      id: "high-total-alloy",
      level: "warning",
      field: "composition",
      message: `Total alloying content (${alloyTotal.toFixed(1)} wt%) is very high. This composition is unusual and may fall outside what the model saw during training.`,
    });
  }

  if (input.C < 0.03 && alloyTotal > 8) {
    warnings.push({
      id: "low-c-high-alloy",
      level: "warning",
      field: "composition",
      message: "Very low carbon combined with high alloy content is an uncommon composition. Double-check element values.",
    });
  }

  if (input.C > 1.0 && !input.steel_family.includes("stainless")) {
    warnings.push({
      id: "high-c-non-stainless",
      level: "warning",
      field: "C",
      message: "Carbon above 1 wt% is rare outside high-carbon or tool steels. Verify carbon and steel family selection.",
    });
  }

  const ce = carbonEquivalent(input);
  if (ce > 0.75) {
    warnings.push({
      id: "high-ce",
      level: "warning",
      field: "composition",
      message: `Carbon equivalent (CE ≈ ${ce.toFixed(2)}) is very high, indicating a heavily alloyed or high-hardenability steel outside typical ranges.`,
    });
  }

  if (input.steel_family.startsWith("stainless") && input.C > 0.25) {
    warnings.push({
      id: "stainless-high-c",
      level: "warning",
      field: "steel_family",
      message: "Selected stainless family with carbon above 0.25 wt% is atypical for austenitic/ferritic grades.",
    });
  }

  if (
    (input.steel_family === "carbon_steel" || input.steel_family === "carbon_medium") &&
    carbideFormers(input) + input.Ni > 3
  ) {
    warnings.push({
      id: "carbon-family-alloy-mismatch",
      level: "warning",
      field: "steel_family",
      message: "Carbon steel family selected but significant Cr, Mo, Ni, or V is present. Consider a low-alloy or stainless family.",
    });
  }

  if (input.Mn > 0 && input.C > 0 && input.Mn / input.C > 40) {
    warnings.push({
      id: "mn-c-ratio",
      level: "info",
      field: "composition",
      message: "Manganese-to-carbon ratio is unusually high. This can occur in some stainless grades but is rare elsewhere.",
    });
  }

  const compSum = input.C + alloyTotal;
  if (compSum > 50) {
    warnings.push({
      id: "impossible-sum",
      level: "error",
      field: "composition",
      message: `Total declared composition (${compSum.toFixed(1)} wt%) exceeds plausible steel chemistry. Check for typos.`,
    });
  }

  if (input.austenitize_T != null && (input.austenitize_T < 750 || input.austenitize_T > 1150)) {
    warnings.push({
      id: "aus-extreme",
      level: "warning",
      field: "austenitize_T",
      message: "Austenitizing temperature is at an extreme value rarely used in commercial heat treatment.",
    });
  }

  if (input.temper_T != null && input.temper_T < 180) {
    warnings.push({
      id: "temper-low",
      level: "warning",
      field: "temper_T",
      message: "Tempering below ~180 °C is uncommon and may not relieve stresses as expected.",
    });
  }

  return warnings;
}

export function hasBlockingWarnings(warnings: InputWarning[]): boolean {
  return warnings.some((w) => w.level === "error");
}
