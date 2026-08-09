"use client";

import type { SteelInput } from "@/lib/api";
import { COMPOSITION_FIELDS } from "@/lib/fieldConfig";

const COLORS = [
  "#57a6f4",
  "#75b9fd",
  "#9dd0ff",
  "#4a8fd4",
  "#3d7ab8",
  "#6ec4a0",
  "#e8b86d",
  "#c97b84",
  "#a78bfa",
];

interface CompositionChartProps {
  input: SteelInput;
}

export function CompositionChart({ input }: CompositionChartProps) {
  const data = COMPOSITION_FIELDS.map((field, i) => ({
    name: field.key,
    label: field.label.split(" ")[0],
    value: Math.max(0, input[field.key] as number),
    color: COLORS[i % COLORS.length],
  })).filter((d) => d.value > 0);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const maxVal = Math.max(...data.map((d) => d.value), 0.01);

  if (data.length === 0) {
    return (
      <div className="glass-panel p-5 text-sm text-white/45">
        Adjust composition sliders to see the element breakdown.
      </div>
    );
  }

  return (
    <section className="glass-panel space-y-4 p-5">
      <div>
        <h3 className="font-display text-base font-semibold">Composition Breakdown</h3>
        <p className="mt-1 text-xs text-white/45">
          Element weight percentages · total {total.toFixed(2)} wt%
        </p>
      </div>

      <div className="space-y-2.5">
        {data.map((item) => (
          <div key={item.name} className="grid grid-cols-[72px_1fr_56px] items-center gap-3">
            <span className="font-mono text-xs text-white/60">{item.name}</span>
            <div className="chart-bar-track">
              <div
                className="chart-bar-fill"
                style={{
                  width: `${(item.value / maxVal) * 100}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
            <span className="text-right font-mono text-xs text-white/70">
              {item.value.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>

      <div className="flex h-3 overflow-hidden rounded-full">
        {data.map((item) => (
          <div
            key={`seg-${item.name}`}
            style={{
              width: `${(item.value / total) * 100}%`,
              backgroundColor: item.color,
            }}
            title={`${item.label}: ${item.value.toFixed(2)} wt%`}
          />
        ))}
      </div>
    </section>
  );
}
