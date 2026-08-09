import type { Metadata } from "@/lib/api";

interface ModelInfoProps {
  metadata: Metadata;
}

export function ModelInfo({ metadata }: ModelInfoProps) {
  return (
    <div className="glass-panel space-y-6 p-6">
      <div>
        <p className="section-label">About</p>
        <h3 className="font-display text-lg font-semibold leading-snug">
          Steel Mechanical Property Predictor
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          Predicts UTS, yield strength, and Brinell hardness from alloy
          composition and heat treatment using gradient-boosted ensemble models
          trained on SteelBench data.
        </p>
      </div>

      <div>
        <p className="section-label">Model Status</p>
        <div className="flex items-center gap-2.5">
          <span
            className={`h-2 w-2 rounded-full ${
              metadata.models_ready
                ? "bg-accent shadow-[0_0_8px_rgba(87,166,244,0.6)]"
                : "bg-error shadow-[0_0_8px_rgba(247,105,121,0.6)]"
            }`}
          />
          <span className="text-sm text-white/70">
            {metadata.models_ready ? "Models ready" : "Models not found"}
          </span>
        </div>
        {!metadata.models_ready && (
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/50">
            python steel_property_predictor.py
          </pre>
        )}
      </div>

      <div>
        <p className="section-label">Test Accuracy</p>
        <ul className="space-y-3">
          {metadata.metrics.map((m) => (
            <li
              key={m.target}
              className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2.5"
            >
              <span className="text-xs text-white/60">{m.label}</span>
              <span className="font-mono text-xs text-accent-light">
                R² {m.test_r2.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-white/[0.06] pt-4">
        <p className="text-[11px] leading-relaxed text-white/35">
          Hardness predictions are most reliable when tempering temperature and
          time are provided. Yield strength has high uncertainty due to missing
          grain-size data in the training set.
        </p>
      </div>
    </div>
  );
}
