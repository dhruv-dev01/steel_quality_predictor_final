export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface SteelInput {
  C: number;
  Mn: number;
  Cr: number;
  Mo: number;
  Ni: number;
  Si: number;
  V: number;
  Cu: number;
  Al: number;
  austenitize_T: number | null;
  temper_T: number | null;
  temper_time_s: number | null;
  quench_medium: string | null;
  steel_family: string;
}

export interface PredictionResult {
  tensile_strength: number;
  yield_strength: number;
  hardness_HB: number;
}

export interface ModelMetric {
  target: string;
  label: string;
  test_r2: number;
  test_mae: number;
  unit: string;
  reliability: "high" | "moderate" | "low";
}

export interface Metadata {
  composition_fields: string[];
  process_fields: string[];
  steel_families: string[];
  quench_media: string[];
  metrics: ModelMetric[];
  models_ready: boolean;
}

export async function fetchMetadata(): Promise<Metadata> {
  const res = await fetch(`${API_BASE}/metadata`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load metadata");
  return res.json();
}

export async function predictProperties(
  input: SteelInput,
): Promise<PredictionResult> {
  const res = await fetch(`${API_BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(", ")
          : "Prediction failed";
    throw new Error(message);
  }

  return res.json();
}

export async function checkHealth(): Promise<{ models_loaded: boolean }> {
  const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
  if (!res.ok) return { models_loaded: false };
  return res.json();
}
