import { PredictorApp } from "@/components/PredictorApp";
import { fetchMetadata } from "@/lib/api";

export default async function HomePage() {
  let metadata;
  try {
    metadata = await fetchMetadata();
  } catch {
    metadata = {
      composition_fields: ["C", "Mn", "Cr", "Mo", "Ni", "Si", "V", "Cu", "Al"],
      process_fields: ["austenitize_T", "temper_T", "quench_medium", "temper_time_s"],
      steel_families: [
        "carbon_steel",
        "carbon_medium",
        "low_alloy_QT",
        "CrMo_QT",
        "NiCrMo_QT",
        "stainless_austenitic",
      ],
      quench_media: ["water", "oil", "air", "polymer", "salt", "NA"],
      metrics: [
        {
          target: "hardness_HB",
          label: "Hardness (HB)",
          test_r2: 0.96,
          test_mae: 14,
          unit: "HB",
          reliability: "high" as const,
        },
        {
          target: "tensile_strength",
          label: "Tensile Strength (UTS)",
          test_r2: 0.5,
          test_mae: 109,
          unit: "MPa",
          reliability: "moderate" as const,
        },
        {
          target: "yield_strength",
          label: "Yield Strength (YS)",
          test_r2: 0.32,
          test_mae: 118,
          unit: "MPa",
          reliability: "low" as const,
        },
      ],
      models_ready: false,
    };
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <header className="mx-auto mb-10 max-w-6xl animate-fade-down">
        {/* <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-white/50">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          AIML · Material Quality
        </div> */}
        <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
          Steel Property{" "}
          <span className="bg-gradient-to-r from-accent to-accent-light bg-clip-text text-transparent">
            Predictor
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/55">
          Enter alloy composition and heat treatment parameters to predict
          tensile strength, yield strength, and Brinell hardness using
          pre-trained models.
        </p>
      </header>

      <PredictorApp metadata={metadata} />
    </main>
  );
}
