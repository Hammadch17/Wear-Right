"use client";

import { motion, useReducedMotion } from "motion/react";
import { ScanFace } from "lucide-react";

type Props = {
  progress: number;
  step: string;
};

/** The short wait between a photo and its result. Text carries the meaning when motion is reduced. */
export default function AnalysingView({ progress, step }: Props) {
  const reducedMotion = useReducedMotion();
  const width = `${Math.min(100, Math.max(0, progress))}%`;

  return (
    <div
      data-testid="scan-analysing"
      role="status"
      aria-live="polite"
      className="w-full bg-white border border-blue-100 rounded-3xl p-6 shadow-[0_20px_50px_-12px_rgba(35,33,29,0.12)] text-center"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 border border-blue-100">
        <ScanFace className={`h-7 w-7 text-blue-600 ${reducedMotion ? "" : "animate-pulse"}`} />
      </div>
      <h3 className="mt-4 text-xl font-serif font-bold text-brand-dark">Analysing your skin tone</h3>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        Checking the light and reading your depth. This takes a couple of seconds.
      </p>

      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        {reducedMotion ? (
          <div className="h-full rounded-full bg-brand-gold" style={{ width }} />
        ) : (
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-brand-gold via-blue-500 to-blue-600"
            initial={{ width: 0 }}
            animate={{ width }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
        )}
      </div>

      <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {step || "READING YOUR PHOTO..."}
      </p>
      <p className="mt-1 text-[11px] font-black tabular-nums text-blue-700">{Math.round(progress)}%</p>
    </div>
  );
}
