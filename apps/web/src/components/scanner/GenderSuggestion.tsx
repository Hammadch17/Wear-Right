"use client";

import { Sparkles } from "lucide-react";

import type { GenderDetection } from "@/features/scanner/api";
import type { ScanGender } from "@/features/scanner/gender";

type Props = {
  detection: GenderDetection | null;
  onChoose: (gender: ScanGender) => void;
  onRetry: () => void;
};

const LABELS: Record<ScanGender, string> = { men: "Men", women: "Women" };

/** Shown only when the model is unavailable or unsure. The shopper must choose; we never guess for them. */
export default function GenderSuggestion({ detection, onChoose, onRetry }: Props) {
  const suggestion = detection?.suggested;
  return (
    <section
      data-testid="gender-suggestion"
      className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-5 text-left shadow-sm"
    >
      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-700">
        <Sparkles className="h-3.5 w-3.5" />
        One quick question
      </p>
      <h3 className="mt-2 font-serif text-xl font-bold text-brand-dark">
        {suggestion ? `Looks like ${LABELS[suggestion]}. Is that right?` : "Which section should we style?"}
      </h3>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
        {detection
          ? `The model is not sure enough (${Math.round(detection.confidence)}% confidence). Pick the section so the picks are right.`
          : "Gender detection is not available on this server. Pick the section so the picks are right."}
      </p>
      {detection?.reasons?.length ? (
        <ul className="mt-3 space-y-1 text-[11px] font-semibold text-amber-800">
          {detection.reasons.map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {(["women", "men"] as const).map((gender) => (
          <button
            key={gender}
            type="button"
            onClick={() => onChoose(gender)}
            data-testid={`gender-suggestion-${gender}`}
            className={`rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white ${
              gender === suggestion ? "bg-blue-700 hover:bg-blue-800" : "bg-slate-700 hover:bg-slate-800"
            }`}
          >
            {LABELS[gender]}
          </button>
        ))}
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-amber-300 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-amber-900 hover:bg-amber-100"
        >
          Scan again
        </button>
      </div>
    </section>
  );
}
