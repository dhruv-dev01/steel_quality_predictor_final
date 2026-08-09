import type { SteelInput } from "./api";

export interface NumericFieldConfig {
  key: keyof SteelInput;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  typicalMin: number;
  typicalMax: number;
  optional?: boolean;
}

export const COMPOSITION_FIELDS: NumericFieldConfig[] = [
  { key: "C", label: "Carbon (C)", unit: "wt%", min: 0, max: 2, step: 0.01, typicalMin: 0.05, typicalMax: 1.2 },
  { key: "Mn", label: "Manganese (Mn)", unit: "wt%", min: 0, max: 20, step: 0.01, typicalMin: 0.3, typicalMax: 2.0 },
  { key: "Cr", label: "Chromium (Cr)", unit: "wt%", min: 0, max: 30, step: 0.01, typicalMin: 0, typicalMax: 5 },
  { key: "Mo", label: "Molybdenum (Mo)", unit: "wt%", min: 0, max: 10, step: 0.01, typicalMin: 0, typicalMax: 1.0 },
  { key: "Ni", label: "Nickel (Ni)", unit: "wt%", min: 0, max: 30, step: 0.01, typicalMin: 0, typicalMax: 4.0 },
  { key: "Si", label: "Silicon (Si)", unit: "wt%", min: 0, max: 5, step: 0.01, typicalMin: 0.1, typicalMax: 1.5 },
  { key: "V", label: "Vanadium (V)", unit: "wt%", min: 0, max: 5, step: 0.01, typicalMin: 0, typicalMax: 0.5 },
  { key: "Cu", label: "Copper (Cu)", unit: "wt%", min: 0, max: 5, step: 0.01, typicalMin: 0, typicalMax: 0.5 },
  { key: "Al", label: "Aluminum (Al)", unit: "wt%", min: 0, max: 5, step: 0.01, typicalMin: 0, typicalMax: 0.15 },
];

export const PROCESS_FIELDS: NumericFieldConfig[] = [
  {
    key: "austenitize_T",
    label: "Austenitize Temp",
    unit: "°C",
    min: 700,
    max: 1200,
    step: 5,
    typicalMin: 800,
    typicalMax: 1050,
  },
  {
    key: "temper_T",
    label: "Temper Temp",
    unit: "°C",
    min: 150,
    max: 700,
    step: 5,
    typicalMin: 200,
    typicalMax: 650,
  },
  {
    key: "temper_time_s",
    label: "Temper Time",
    unit: "s",
    min: 0,
    max: 86400,
    step: 60,
    typicalMin: 1800,
    typicalMax: 14400,
    optional: true,
  },
];

export function clampField(config: NumericFieldConfig, value: number): number {
  const clamped = Math.min(config.max, Math.max(config.min, value));
  const decimals = config.step < 1 ? 2 : config.step < 10 ? 1 : 0;
  return Number(clamped.toFixed(decimals));
}

export function getFieldValue(input: SteelInput, key: keyof SteelInput): number {
  const raw = input[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (key === "temper_time_s") return 3600;
  return 0;
}
