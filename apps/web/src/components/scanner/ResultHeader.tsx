"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";

import {
  TONE_SWATCH,
  confidenceWord,
  type ScanDepth,
} from "@/features/scanner/gender";
import type { SavedScan } from "@/features/scanner/savedScan";

type Props = {
  scan: SavedScan;
  onChangeTone: (tone: ScanDepth) => Promise<void> | void;
  changing?: boolean;
  error?: string;
};

const DEPTHS: ScanDepth[] = ["Fair", "Medium", "Dark"];

/** The result headline, its swatch, and the in-place "choose mine" correction. */
export default function ResultHeader({ scan, onChangeTone, changing = false, error }: Props) {
  const [open, setOpen] = useState(false);

  const choose = async (tone: ScanDepth) => {
    if (tone === scan.tone) {
      setOpen(false);
      return;
    }
    await onChangeTone(tone);
    setOpen(false);
  };

  return (
    <section className="w-full bg-white border border-brand-border/60 rounded-3xl p-6 sm:p-8 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Your result</p>
          <h1 data-testid="result-tone" className="mt-2 font-serif text-3xl font-bold text-brand-dark sm:text-4xl">
            Your skin tone: <span className="text-blue-700">{scan.tone}</span>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {scan.undertone && (
              <span
                data-testid="result-undertone"
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-blue-700"
              >
                {scan.undertone} undertone
              </span>
            )}
            <span
              data-testid="result-confidence"
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-slate-600"
            >
              {confidenceWord(scan.confidence)} confidence
            </span>
            {typeof scan.monk === "number" && scan.monk > 0 && (
              <span className="text-[11px] font-bold text-slate-500">Monk {scan.monk}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            aria-label={`${scan.tone} skin tone colour`}
            className="h-20 w-20 shrink-0 rounded-full border-4 border-white shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
            style={{ backgroundColor: TONE_SWATCH[scan.tone] }}
          />
        </div>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-800 underline underline-offset-4"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Not right? Choose mine
        </button>

        {open && (
          <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
            <p className="text-[11px] font-semibold text-slate-600">
              Pick the closest depth. The picks below change in place, without another scan.
            </p>
            <div role="group" aria-label="Choose your skin tone" className="mt-3 flex flex-wrap gap-2">
              {DEPTHS.map((depth) => (
                <button
                  key={depth}
                  type="button"
                  data-testid={`result-tone-${depth.toLowerCase()}`}
                  disabled={changing}
                  onClick={() => void choose(depth)}
                  className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 ${
                    depth === scan.tone
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-400"
                  }`}
                >
                  {depth}
                </button>
              ))}
            </div>
            {error && <p className="mt-2 text-[11px] font-bold text-red-700">{error}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
