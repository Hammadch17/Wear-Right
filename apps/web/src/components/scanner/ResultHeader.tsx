"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";

import {
  TONE_SWATCH,
  confidenceWord,
  type ScanDepth,
  type ScanGender,
} from "@/features/scanner/gender";
import type { SavedScan } from "@/features/scanner/savedScan";

type Props = {
  scan: SavedScan;
  onChangeTone: (tone: ScanDepth) => Promise<void> | void;
  onChangeGender: (gender: ScanGender) => void;
  changing?: boolean;
  error?: string;
};

const DEPTHS: ScanDepth[] = ["Fair", "Medium", "Dark"];
const GENDERS: ScanGender[] = ["men", "women"];

/** The result headline, its swatch, the detected section and the in-place corrections. */
export default function ResultHeader({ scan, onChangeTone, onChangeGender, changing = false, error }: Props) {
  const [open, setOpen] = useState(false);
  const [openGender, setOpenGender] = useState(false);

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
            <span
              data-testid="result-gender"
              className="rounded-full border border-brand-gold/30 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-800"
            >
              {scan.gender === "men" ? "Men's" : "Women's"} section
              {scan.genderDetection ? ` · ${Math.round(scan.genderDetection.confidence)}% sure` : ""}
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

      <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
              {scan.genderDetection ? "Auto-detected section" : "Section you chose"}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              {scan.genderDetection
                ? `Looks like ${scan.gender === "men" ? "Men" : "Women"} (${Math.round(scan.genderDetection.confidence)}% confidence, ${scan.genderDetection.confidence_label}).`
                : `Picks are from the ${scan.gender === "men" ? "Men's" : "Women's"} section.`}
            </p>
            {scan.genderDetection?.reasons?.length ? (
              <p className="mt-1 text-[11px] font-semibold text-amber-800">{scan.genderDetection.reasons.join(" · ")}</p>
            ) : null}
          </div>
          <button
            type="button"
            data-testid="result-gender-change"
            aria-expanded={openGender}
            onClick={() => setOpenGender((current) => !current)}
            className="rounded-full border border-amber-300 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-amber-900 hover:bg-amber-100"
          >
            Change section
          </button>
        </div>
        {openGender && (
          <div role="group" aria-label="Choose the shop section" className="mt-3 flex flex-wrap gap-2">
            {GENDERS.map((gender) => (
              <button
                key={gender}
                type="button"
                data-testid={`result-gender-${gender}`}
                onClick={() => {
                  onChangeGender(gender);
                  setOpenGender(false);
                }}
                className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wider ${
                  gender === scan.gender
                    ? "border-amber-600 bg-amber-600 text-white"
                    : "border-amber-200 bg-white text-amber-900 hover:border-amber-400"
                }`}
              >
                {gender === "men" ? "Men" : "Women"}
              </button>
            ))}
          </div>
        )}
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
