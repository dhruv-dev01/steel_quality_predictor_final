"use client";

import type { SteelInput } from "@/lib/api";
import type { NumericFieldConfig } from "@/lib/fieldConfig";
import { clampField, getFieldValue } from "@/lib/fieldConfig";

interface SliderFieldProps {
  config: NumericFieldConfig;
  input: SteelInput;
  onChange: (value: number | null) => void;
  warning?: boolean;
}

export function SliderField({ config, input, onChange, warning }: SliderFieldProps) {
  const value = getFieldValue(input, config.key);
  const typicalLeft = ((config.typicalMin - config.min) / (config.max - config.min)) * 100;
  const typicalWidth =
    ((config.typicalMax - config.typicalMin) / (config.max - config.min)) * 100;

  function handleSlider(next: number) {
    onChange(clampField(config, next));
  }

  function handleInput(raw: string) {
    if (config.optional && raw.trim() === "") {
      onChange(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(clampField(config, parsed));
  }

  return (
    <div className={`slider-field ${warning ? "slider-field-warning" : ""}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={config.key} className="field-label mb-0">
          {config.label}
          {config.optional && <span className="ml-1 text-white/40">optional</span>}
        </label>
        <span className="font-mono text-[10px] text-white/35">
          typical {config.typicalMin}–{config.typicalMax}
          {config.unit ? ` ${config.unit}` : ""}
        </span>
      </div>

      <div className="slider-track-wrap">
        <div
          className="slider-typical-band"
          style={{ left: `${typicalLeft}%`, width: `${typicalWidth}%` }}
          aria-hidden
        />
        <input
          id={config.key}
          type="range"
          min={config.min}
          max={config.max}
          step={config.step}
          value={value}
          onChange={(e) => handleSlider(Number(e.target.value))}
          className="slider-input"
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={config.min}
          max={config.max}
          step={config.step}
          value={config.optional && input[config.key] == null ? "" : value}
          placeholder={config.optional ? "default 3600" : undefined}
          onChange={(e) => handleInput(e.target.value)}
          className="glass-input font-mono py-2 text-sm"
        />
        {config.unit && (
          <span className="shrink-0 text-xs text-white/40">{config.unit}</span>
        )}
      </div>
    </div>
  );
}
