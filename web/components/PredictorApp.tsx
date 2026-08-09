"use client";

import { useEffect, useMemo, useState } from "react";
import type { Metadata, PredictionResult, SteelInput } from "@/lib/api";
import { predictProperties } from "@/lib/api";
import { computeInputWarnings, hasBlockingWarnings } from "@/lib/validation";
import { PredictionForm } from "./PredictionForm";
import { ResultCards } from "./ResultCards";
import { ModelInfo } from "./ModelInfo";
import { InputWarnings } from "./InputWarnings";
import { CompositionChart } from "./CompositionChart";
import { ResultsChart } from "./ResultsChart";

const DEFAULT_INPUT: SteelInput = {
  C: 0.4,
  Mn: 0.8,
  Cr: 1.0,
  Mo: 0.2,
  Ni: 0.0,
  Si: 0.3,
  V: 0.0,
  Cu: 0.0,
  Al: 0.0,
  austenitize_T: 850,
  temper_T: 580,
  temper_time_s: null,
  quench_medium: "oil",
  steel_family: "low_alloy_QT",
};

interface PredictorAppProps {
  metadata: Metadata;
}

export function PredictorApp({ metadata }: PredictorAppProps) {
  const [input, setInput] = useState<SteelInput>(DEFAULT_INPUT);
  const [results, setResults] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warnings = useMemo(() => computeInputWarnings(input), [input]);

  useEffect(() => {
    if (!metadata.models_ready) {
      setError(
        "Trained models not found. Run `python steel_property_predictor.py` from the project root first.",
      );
    }
  }, [metadata.models_ready]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const preds = await predictProperties(input);
      setResults(preds);
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : "Prediction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-8">
        <section className="glass-panel animate-fade-down p-6 sm:p-8">
          <PredictionForm
            input={input}
            metadata={metadata}
            loading={loading}
            warnings={warnings}
            onChange={setInput}
            onSubmit={handleSubmit}
          />
        </section>

        <CompositionChart input={input} />

        {warnings.length > 0 && <InputWarnings warnings={warnings} />}

        {error && (
          <div
            className="animate-fade-slide-down rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {results && (
          <div className="space-y-6">
            <ResultCards results={results} metrics={metadata.metrics} />
            <ResultsChart results={results} />
            {hasBlockingWarnings(warnings) && (
              <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                Predictions were generated, but critical input issues were detected. Treat these results with caution.
              </p>
            )}
          </div>
        )}
      </div>

      <aside className="animate-fade-slide-up lg:sticky lg:top-8 lg:self-start">
        <ModelInfo metadata={metadata} />
      </aside>
    </div>
  );
}
