"use client";

import type { ScanGender } from "@/features/scanner/gender";

type Props = {
  value: ScanGender | null;
  onChange: (gender: ScanGender) => void;
  disabled?: boolean;
};

/** The shopper tells us who they are shopping for. We never guess gender from a face. */
export default function GenderPicker({ value, onChange, disabled = false }: Props) {
  return (
    <section
      aria-labelledby="scan-gender-title"
      className="w-full max-w-[380px] bg-white border border-brand-border/60 rounded-3xl p-5 shadow-sm"
    >
      <h3 id="scan-gender-title" className="text-base font-black text-brand-dark">
        Who are we styling?
      </h3>
      <p className="mt-1 text-xs font-semibold text-slate-500 leading-relaxed">
        Men&apos;s and women&apos;s picks are different, so choose one. We never guess this from your face.
      </p>
      <div role="group" aria-label="Choose Men or Women" className="mt-4 grid grid-cols-2 gap-3">
        {(["men", "women"] as const).map((gender) => {
          const selected = value === gender;
          return (
            <button
              key={gender}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              data-testid={`scan-gender-${gender}`}
              onClick={() => onChange(gender)}
              className={`rounded-2xl border-2 py-3 text-xs font-black uppercase tracking-widest transition-all ${
                selected
                  ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-900/10"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-800"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {gender === "men" ? "Men" : "Women"}
            </button>
          );
        })}
      </div>
      {!value && (
        <p className="mt-3 text-[11px] font-bold text-amber-700">
          Choose Men or Women to unlock the camera and photo upload.
        </p>
      )}
    </section>
  );
}
