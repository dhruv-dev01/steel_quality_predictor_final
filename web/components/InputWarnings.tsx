import type { InputWarning } from "@/lib/validation";

interface InputWarningsProps {
  warnings: InputWarning[];
}

const LEVEL_STYLES = {
  info: "border-white/15 bg-white/[0.04] text-white/70",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  error: "border-error/40 bg-error/10 text-error",
} as const;

const LEVEL_ICONS = {
  info: "ℹ",
  warning: "⚠",
  error: "✕",
} as const;

export function InputWarnings({ warnings }: InputWarningsProps) {
  if (warnings.length === 0) return null;

  const errors = warnings.filter((w) => w.level === "error");
  const others = warnings.filter((w) => w.level !== "error");

  return (
    <section className="animate-fade-slide-down space-y-3" aria-live="polite">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Input Checks
        </h2>
        <p className="mt-1 text-sm text-white/50">
          {errors.length > 0
            ? "Fix critical issues before trusting predictions."
            : "Some values look unusual compared to the training dataset."}
        </p>
      </div>

      <ul className="space-y-2">
        {[...errors, ...others].map((warning) => (
          <li
            key={warning.id}
            className={`flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${LEVEL_STYLES[warning.level]}`}
          >
            <span className="mt-0.5 shrink-0 text-base leading-none opacity-80">
              {LEVEL_ICONS[warning.level]}
            </span>
            <span>{warning.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
