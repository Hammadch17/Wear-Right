"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, ArrowRight, Loader2, RefreshCw, Shirt } from "lucide-react";

import { ApiError } from "@/lib/api";
import { useNavigate } from "@/lib/navigation";
import { useAuth } from "@/features/auth/AuthProvider";
import { recommenderApi, type TonePicksResponse } from "@/features/recommender/api";
import { scannerApi } from "@/features/scanner/api";
import {
  mannequinSkin,
  normaliseDepth,
  toneKey,
  type ScanDepth,
} from "@/features/scanner/gender";
import { savedScanStore, type SavedScan } from "@/features/scanner/savedScan";
import ResultHeader from "./scanner/ResultHeader";
import TonePickCard from "./scanner/TonePickCard";

function requestError(error: unknown): string {
  if (error instanceof ApiError) return `We could not load your picks: ${error.message}`;
  return "We could not reach the server. Check that it is running and try again.";
}

/** The skin tone result, the four tone groups and the ways out of the flow. */
export default function ScannerResultView() {
  const navigate = useNavigate();
  const { setSkinTone } = useAuth();
  const scan = useSyncExternalStore(
    savedScanStore.subscribe,
    savedScanStore.getSnapshot,
    savedScanStore.getServerSnapshot,
  );
  const [request, setRequest] = useState<{
    key: string;
    data: TonePicksResponse | null;
    error: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState("");
  const checkedStorage = useRef(false);

  // A fresh window has nothing saved. Read storage directly, not the hydrated snapshot, so the
  // check cannot throw away a result that is about to arrive from localStorage.
  useEffect(() => {
    if (checkedStorage.current) return;
    checkedStorage.current = true;
    if (!savedScanStore.getSnapshot()) navigate("/scanner");
  }, [navigate]);

  const requestKey = scan ? `${scan.tone}|${scan.gender}|${scan.undertone ?? ""}|${retry}` : "";
  const loading = scan !== null && request?.key !== requestKey;
  const data = request?.data ?? null;
  const error = request?.error ?? "";

  useEffect(() => {
    if (!scan) return;
    const key = `${scan.tone}|${scan.gender}|${scan.undertone ?? ""}|${retry}`;
    let cancelled = false;
    recommenderApi
      .tonePicks({
        tone: toneKey(scan.tone),
        gender: scan.gender,
        undertone: scan.undertone ?? undefined,
      })
      .then((response) => {
        if (!cancelled) setRequest({ key, data: response, error: "" });
      })
      .catch((reason) => {
        if (!cancelled) setRequest({ key, data: null, error: requestError(reason) });
      });
    return () => {
      cancelled = true;
    };
  }, [scan, retry]);

  const changeTone = async (tone: ScanDepth) => {
    if (!scan) return;
    setChanging(true);
    setChangeError("");
    try {
      const response = await scannerApi.manual(tone, scan.undertone ?? "neutral");
      const next: SavedScan = {
        ...scan,
        tone: normaliseDepth(response.detected_skin_tone ?? response.depth ?? tone),
        undertone: response.undertone ?? scan.undertone,
        confidence: Number(response.confidence_score ?? response.confidence ?? scan.confidence),
        monk: response.monk ?? null,
      };
      savedScanStore.set(next);
      setSkinTone(next.tone);
    } catch (reason) {
      setChangeError(requestError(reason));
    } finally {
      setChanging(false);
    }
  };

  const scanAgain = () => {
    savedScanStore.set(null);
    navigate("/scanner");
  };

  if (!scan) return null;

  const genderLabel = scan.gender === "men" ? "Men's" : "Women's";
  const matchesUrl =
    `/recommended?skinTone=${toneKey(scan.tone)}` +
    `${scan.undertone ? `&undertone=${scan.undertone}` : ""}` +
    `&confidence=${Math.round(scan.confidence)}&gender=${scan.gender}&theme=palette`;
  const dressingRoomUrl = `/mannequin?gender=${scan.gender}&skin=${mannequinSkin(scan.tone)}`;

  return (
    <main data-testid="scanner-result" className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <ResultHeader scan={scan} onChangeTone={changeTone} changing={changing} error={changeError} />

      <section aria-labelledby="tone-picks-title" className="mt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Picked for your tone</p>
            <h2 id="tone-picks-title" className="mt-1 font-serif text-2xl font-bold text-brand-dark sm:text-3xl">
              {genderLabel} picks for {scan.tone} skin
            </h2>
          </div>
          <p className="max-w-sm text-xs font-semibold leading-relaxed text-slate-500">
            Colours from your best palette first, then a second colour family where the shop has one.
          </p>
        </div>

        {loading && (
          <div className="mt-8 flex items-center justify-center rounded-3xl border border-brand-border/60 bg-white py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-700" aria-label="Finding your picks" />
          </div>
        )}

        {!loading && error && (
          <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-center">
            <AlertCircle className="mx-auto h-7 w-7 text-red-600" />
            <p className="mt-2 text-sm font-bold text-red-800">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((current) => current + 1)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-dark px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div data-testid="tone-groups" className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
            {data.groups.map((group) => (
              <section key={group.key} data-testid={`tone-group-${group.key}`}>
                <h3 className="mb-3 flex items-center gap-2 font-serif text-xl font-bold text-brand-dark">
                  <Shirt className="h-5 w-5 text-blue-700" />
                  {group.label}
                </h3>
                {group.short && (
                  <p
                    data-testid={`tone-group-short-${group.key}`}
                    className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800"
                  >
                    {group.items.length === 0
                      ? `No ${group.label.toLowerCase()} for this tone yet.`
                      : `Only ${group.items.length} ${group.label.toLowerCase()} available for this tone right now.`}
                  </p>
                )}
                {group.items.length === 0 ? (
                  <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-xs font-semibold text-slate-500">
                    The team is adding more {group.label.toLowerCase()} for this tone.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {group.items.map((item) => (
                      <TonePickCard key={item.id} item={item} gender={scan.gender} tone={scan.tone} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {!loading && !error && data && data.short_groups.length > 0 && (
          <p className="mt-6 text-xs font-semibold text-slate-500">
            Some groups are short because the shop does not have two products for this tone and gender yet.
          </p>
        )}
      </section>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => navigate(matchesUrl)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-700 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-900/10 transition-colors hover:bg-blue-800"
        >
          See all my matches
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => navigate(dressingRoomUrl)}
          className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-brand-dark px-6 py-3 text-xs font-black uppercase tracking-wider text-brand-dark transition-colors hover:bg-brand-dark hover:text-white"
        >
          Open dressing room
        </button>
        <button
          type="button"
          onClick={scanAgain}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-border px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-600 transition-colors hover:border-slate-400 hover:text-brand-dark"
        >
          <RefreshCw className="h-4 w-4" />
          Scan again
        </button>
      </div>
    </main>
  );
}
