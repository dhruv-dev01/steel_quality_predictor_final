"use client";

import type { PredictionResult } from "@/lib/api";

interface ResultsChartProps {
  results: PredictionResult;
}

const BARS = [
  { key: "hardness_HB" as const, label: "Hardness", unit: "HB", color: "#57a6f4" },
  { key: "tensile_strength" as const, label: "Tensile (UTS)", unit: "MPa", color: "#75b9fd" },
  { key: "yield_strength" as const, label: "Yield (YS)", unit: "MPa", color: "#9dd0ff" },
];

const REFERENCE_MAX = {
  hardness_HB: 650,
  tensile_strength: 2200,
  yield_strength: 1800,
};

export function ResultsChart({ results }: ResultsChartProps) {
  return (
    <section className="glass-panel space-y-4 p-5">
      <div>
        <h3 className="font-display text-base font-semibold">Predicted Properties Chart</h3>
        <p className="mt-1 text-xs text-white/45">
          Bar heights are scaled independently per property (different units).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {BARS.map(({ key, label, unit, color }) => {
          const value = results[key];
          const max = REFERENCE_MAX[key];
          const heightPct = Math.min(100, (value / max) * 100);

          return (
            <div key={key} className="flex flex-col items-center">
              <div className="relative flex h-40 w-full items-end justify-center rounded-xl bg-black/25 px-4 pb-2 pt-6">
                <div
                  className="results-bar w-full max-w-[72px] rounded-t-lg transition-all duration-500"
                  style={{
                    height: `${heightPct}%`,
                    background: `linear-gradient(to top, ${color}99, ${color})`,
                    boxShadow: `0 0 24px ${color}44`,
                  }}
                />
                <span className="absolute top-2 font-mono text-sm font-semibold text-text-primary">
                  {value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
              </div>
              <p className="mt-2 text-center text-xs font-medium text-white/70">{label}</p>
              <p className="text-[10px] text-white/40">{unit}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
