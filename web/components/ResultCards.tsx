import type { ModelMetric, PredictionResult } from "@/lib/api";

interface ResultCardsProps {
  results: PredictionResult;
  metrics: ModelMetric[];
}

const RESULT_CONFIG = [
  {
    key: "hardness_HB" as const,
    title: "Hardness",
    subtitle: "Brinell (HB)",
    accent: "from-accent/20 to-transparent",
    icon: "◆",
  },
  {
    key: "tensile_strength" as const,
    title: "Tensile Strength",
    subtitle: "UTS (MPa)",
    accent: "from-accent-light/15 to-transparent",
    icon: "▲",
  },
  {
    key: "yield_strength" as const,
    title: "Yield Strength",
    subtitle: "YS (MPa)",
    accent: "from-white/10 to-transparent",
    icon: "●",
  },
];

function reliabilityBadge(reliability: ModelMetric["reliability"]) {
  const styles = {
    high: "bg-accent/15 text-accent-light border-accent/25",
    moderate: "bg-white/10 text-white/70 border-white/15",
    low: "bg-error/10 text-error border-error/25",
  };
  const labels = { high: "High confidence", moderate: "Moderate", low: "Low confidence" };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[reliability]}`}
    >
      {labels[reliability]}
    </span>
  );
}

export function ResultCards({ results, metrics }: ResultCardsProps) {
  const metricMap = Object.fromEntries(metrics.map((m) => [m.target, m]));

  return (
    <section className="space-y-4">
      <div className="animate-fade-slide-down">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Predicted Properties
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Values from the trained ensemble models in{" "}
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-accent-light">
            models/
          </code>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {RESULT_CONFIG.map(({ key, title, subtitle, accent, icon }) => {
          const value = results[key];
          const metric = metricMap[key];
          const unit = metric?.unit ?? "";

          return (
            <div key={key} className="metric-card group">
              <div
                className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-60 transition-opacity group-hover:opacity-100`}
              />
              <div className="relative">
                <div className="mb-3 flex items-start justify-between">
                  <span className="text-lg text-accent/80">{icon}</span>
                  {metric && reliabilityBadge(metric.reliability)}
                </div>
                <p className="font-display text-sm font-medium text-white/60">
                  {title}
                </p>
                <p className="text-[11px] text-white/40">{subtitle}</p>
                <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-text-primary">
                  {value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  <span className="ml-1.5 text-base font-normal text-white/40">
                    {unit}
                  </span>
                </p>
                {metric && (
                  <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-white/35">
                    Test R² {metric.test_r2.toFixed(2)} · MAE ±{metric.test_mae}{" "}
                    {unit}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
