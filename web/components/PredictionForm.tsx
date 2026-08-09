"use client";

import type { Metadata, SteelInput } from "@/lib/api";
import { COMPOSITION_FIELDS, PROCESS_FIELDS } from "@/lib/fieldConfig";
import type { InputWarning } from "@/lib/validation";
import { SliderField } from "./SliderField";

interface PredictionFormProps {
  input: SteelInput;
  metadata: Metadata;
  loading: boolean;
  warnings: InputWarning[];
  onChange: (input: SteelInput) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function formatFamilyLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PredictionForm({
  input,
  metadata,
  loading,
  warnings,
  onChange,
  onSubmit,
}: PredictionFormProps) {
  const warnedFields = new Set(
    warnings.filter((w) => w.field && w.field !== "composition").map((w) => w.field),
  );
  const hasCompositionWarning = warnings.some((w) => w.field === "composition");

  function updateField<K extends keyof SteelInput>(key: K, value: SteelInput[K]) {
    onChange({ ...input, [key]: value });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
          Composition
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Use sliders or type values directly. Green band marks typical training range.
        </p>
      </div>

      <div className={hasCompositionWarning ? "rounded-xl ring-1 ring-amber-400/25" : ""}>
        <p className="section-label">Alloying Elements</p>
        <div className="grid gap-5 sm:grid-cols-2">
          {COMPOSITION_FIELDS.map((config) => (
            <SliderField
              key={config.key}
              config={config}
              input={input}
              warning={warnedFields.has(config.key) || hasCompositionWarning}
              onChange={(value) => updateField(config.key, value as number)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="section-label">Heat Treatment</p>
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="steel_family" className="field-label">
              Steel Family
            </label>
            <select
              id="steel_family"
              className={`glass-select ${warnedFields.has("steel_family") ? "ring-1 ring-amber-400/40" : ""}`}
              value={input.steel_family}
              onChange={(e) => updateField("steel_family", e.target.value)}
            >
              {metadata.steel_families.map((family) => (
                <option key={family} value={family} className="bg-base-surface">
                  {formatFamilyLabel(family)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="quench_medium" className="field-label">
              Quench Medium
            </label>
            <select
              id="quench_medium"
              className="glass-select"
              value={input.quench_medium ?? ""}
              onChange={(e) =>
                updateField("quench_medium", e.target.value || null)
              }
            >
              {metadata.quench_media.map((medium) => (
                <option key={medium} value={medium} className="bg-base-surface">
                  {medium === "NA" ? "Unknown / N/A" : medium.charAt(0).toUpperCase() + medium.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {PROCESS_FIELDS.map((config) => (
            <SliderField
              key={config.key}
              config={config}
              input={input}
              warning={warnedFields.has(config.key)}
              onChange={(value) => updateField(config.key, value)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-white/[0.06] pt-6">
        <button
          type="submit"
          className="btn-primary min-w-[160px]"
          disabled={loading || !metadata.models_ready}
        >
          {loading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Predicting…
            </>
          ) : (
            "Predict Properties"
          )}
        </button>
        {!metadata.models_ready && (
          <p className="text-xs text-white/40">
            Train models first to enable predictions
          </p>
        )}
      </div>
    </form>
  );
}
