"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@/lib/navigation";
import { motion } from "motion/react";
import {
  Camera,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Binary,
  Upload,
  HelpCircle,
  Lock,
} from "lucide-react";

import AnalysingView from "@/components/scanner/AnalysingView";
import GenderPicker from "@/components/scanner/GenderPicker";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { scannerApi, type QualityCheck } from "@/features/scanner/api";
import {
  genderFromProfile,
  normaliseDepth,
  profileGender,
  type ScanDepth,
  type ScanGender,
  type ScanUndertone,
} from "@/features/scanner/gender";
import { savedScanStore, scanGenderStore, type SavedScan } from "@/features/scanner/savedScan";
import { waitForAnalysing } from "@/features/scanner/analysing";

type ScanState = "idle" | "camera" | "scanning" | "retake" | "error";

const TELEMETRY_STEPS = [
  "INITIALIZING OPTICAL SENSORS...",
  "CAPTURING MULTIPLE FRAMES...",
  "SELECTING BEST USABLE FRAME...",
  "APPLYING WHITE BALANCE CORRECTION...",
  "ANALYZING LAB COLOR SPACE...",
  "CALCULATING ITA ANGLE...",
  "MAPPING SKIN DEPTH...",
  "FINALIZING ANALYSIS...",
];

/** Say what actually went wrong: the server's own message when it answered, otherwise that it could not be reached. */
function scanErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) return `The face scanner is not ready on the server. ${error.message}`;
    return `The scan could not be analysed: ${error.message}`;
  }
  return "We could not reach the server. Check that it is running and try again.";
}

export default function FaceScanView() {
  const navigate = useNavigate();
  const { setSkinTone, profile, updateProfile } = useAuth();
  const gender = useSyncExternalStore(
    scanGenderStore.subscribe,
    scanGenderStore.getSnapshot,
    scanGenderStore.getServerSnapshot,
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoCaptureTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [progress, setProgress] = useState(0);
  const [activeTelemetry, setActiveTelemetry] = useState("CAMERA IDLE");
  const [previewImage, setPreviewImage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [backendMessage, setBackendMessage] = useState("");
  const [qualityChecks, setQualityChecks] = useState<QualityCheck[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualDepth, setManualDepth] = useState<ScanDepth>("Medium");
  const [manualUndertone, setManualUndertone] = useState<ScanUndertone>("neutral");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const clearAutoTimers = () => {
    if (autoCaptureTimerRef.current) {
      window.clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  const clearProgressTimer = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // Release the camera and timers when leaving the page.
  useEffect(() => {
    return () => {
      stopCamera();
      clearAutoTimers();
      clearProgressTimer();
    };
  }, []);

  // Prefill the saved profile choice. A local choice already made on this device stays.
  useEffect(() => {
    if (gender) return;
    const fromProfile = genderFromProfile(profile?.gender);
    if (fromProfile) scanGenderStore.set(fromProfile);
  }, [gender, profile]);

  const chooseGender = (next: ScanGender) => {
    scanGenderStore.set(next);
    if (profile) void updateProfile({ gender: profileGender(next) }).catch(() => undefined);
  };

  const startCamera = async () => {
    if (!gender) return;
    try {
      clearAutoTimers();
      clearProgressTimer();
      setErrorMessage("");
      setBackendMessage("");
      setPreviewImage("");
      setCountdown(null);
      setQualityChecks([]);
      setScanState("camera");
      setActiveTelemetry("WAITING FOR CAMERA PERMISSION...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCountdown(4);
      setActiveTelemetry("CAMERA READY. AUTO MULTI-FRAME SCAN STARTING...");

      let remaining = 4;
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0 && countdownTimerRef.current) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      }, 1000);

      autoCaptureTimerRef.current = window.setTimeout(() => {
        void captureMultipleFrames();
      }, 4000);
    } catch (error) {
      console.error("Camera Error:", error);
      setScanState("error");
      setErrorMessage("Camera access denied or camera not available.");
    }
  };

  const runProgressAnimation = () => {
    clearProgressTimer();
    setProgress(0);
    setActiveTelemetry(TELEMETRY_STEPS[0]);
    let currentProgress = 0;
    progressTimerRef.current = window.setInterval(() => {
      currentProgress += 8;
      setProgress(Math.min(currentProgress, 100));
      const stepIndex = Math.min(
        Math.floor((currentProgress / 100) * TELEMETRY_STEPS.length),
        TELEMETRY_STEPS.length - 1,
      );
      setActiveTelemetry(TELEMETRY_STEPS[stepIndex]);
      if (currentProgress >= 100) {
        clearProgressTimer();
      }
    }, 120);
  };

  const captureOneFrame = async (): Promise<{ blob: Blob; imageDataUrl: string } | null> => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((createdBlob) => resolve(createdBlob), "image/jpeg", 0.9);
    });
    if (!blob) return null;
    return { blob, imageDataUrl };
  };

  const saveAndOpenResult = (scan: SavedScan) => {
    savedScanStore.set(scan);
    setSkinTone(scan.tone);
    setProgress(100);
    setActiveTelemetry("SCAN COMPLETE");
    navigate("/scanner/result");
  };

  const sendImagesToBackend = async (blobs: Blob[]) => {
    const chosen = gender;
    if (!chosen) return;
    const startedAt = Date.now();

    try {
      clearProgressTimer();
      setScanState("scanning");
      setErrorMessage("");
      setBackendMessage("");
      setQualityChecks([]);
      runProgressAnimation();

      const formData = new FormData();
      if (blobs.length === 1) {
        formData.append("image", blobs[0], "face-scan.jpg");
      } else {
        blobs.forEach((blob, index) => {
          formData.append("images", blob, `face-frame-${index + 1}.jpg`);
        });
      }

      const data = await scannerApi.analyze(formData);
      await waitForAnalysing(startedAt);

      saveAndOpenResult({
        tone: normaliseDepth(data.detected_skin_tone || data.depth),
        undertone: data.undertone ?? null,
        confidence: Number(data.confidence_score ?? data.confidence ?? 0),
        monk: data.monk ?? null,
        gender: chosen,
      });
    } catch (error) {
      // A 422 is a normal "no usable face" answer: keep the retake guidance and manual fallback on this page.
      if (error instanceof ApiError && error.status === 422) {
        clearProgressTimer();
        const details = (error.details ?? {}) as { quality?: { checks?: QualityCheck[] } | null };
        setBackendMessage(
          error.message || "We could not find a clear face in that photo. Please scan again or pick your tone below.",
        );
        setQualityChecks(details.quality?.checks ?? []);
        setProgress(100);
        setActiveTelemetry("SCAN COMPLETE");
        setScanState("retake");
        return;
      }
      console.error("Scan API Error:", error);
      clearProgressTimer();
      setScanState("error");
      setErrorMessage(scanErrorMessage(error));
    }
  };

  const captureMultipleFrames = async () => {
    if (!gender) return;
    clearAutoTimers();
    setCountdown(null);
    if (!videoRef.current || !canvasRef.current) {
      setScanState("error");
      setErrorMessage("Camera frame not available.");
      return;
    }

    try {
      setActiveTelemetry("CAPTURING MULTIPLE FRAMES FOR BEST RESULT...");
      const capturedBlobs: Blob[] = [];
      let latestPreview = "";
      for (let i = 0; i < 6; i++) {
        const frame = await captureOneFrame();
        if (frame) {
          capturedBlobs.push(frame.blob);
          latestPreview = frame.imageDataUrl;
          setPreviewImage(latestPreview);
        }
        await delay(350);
      }

      if (capturedBlobs.length === 0) {
        setScanState("error");
        setErrorMessage("Unable to capture frames.");
        return;
      }

      stopCamera();
      await sendImagesToBackend(capturedBlobs);
    } catch (error) {
      console.error("Multi-frame Capture Error:", error);
      setScanState("error");
      setErrorMessage("Unable to complete multi-frame scan.");
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !gender) return;
    clearAutoTimers();
    setPreviewImage(URL.createObjectURL(file));
    stopCamera();
    await sendImagesToBackend([file]);
  };

  const resetScan = () => {
    clearAutoTimers();
    clearProgressTimer();
    stopCamera();
    setScanState("idle");
    setProgress(0);
    setActiveTelemetry("CAMERA IDLE");
    setPreviewImage("");
    setErrorMessage("");
    setBackendMessage("");
    setQualityChecks([]);
    setCountdown(null);
  };

  const submitManualTone = async () => {
    if (!gender) return;
    try {
      setManualSubmitting(true);
      setErrorMessage("");
      const response = await scannerApi.manual(manualDepth, manualUndertone);
      saveAndOpenResult({
        tone: normaliseDepth(response.detected_skin_tone || response.depth || manualDepth),
        undertone: response.undertone ?? manualUndertone,
        confidence: Number(response.confidence_score ?? response.confidence ?? 100),
        monk: response.monk ?? null,
        gender,
      });
    } catch (error) {
      setErrorMessage(scanErrorMessage(error));
      setScanState("error");
    } finally {
      setManualSubmitting(false);
    }
  };

  const manualVisible = showManual || scanState === "retake" || scanState === "error";
  const showStartButtons = scanState === "idle" || scanState === "error" || scanState === "retake";

  return (
    <div className="relative flex min-h-[calc(100vh-80px)] w-full flex-col items-center justify-center overflow-hidden bg-cream-base px-6 py-12 font-sans tracking-tight">
      <div className="pointer-events-none absolute right-[-100px] top-10 h-96 w-96 rounded-full bg-blue-100/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-[-100px] h-96 w-96 rounded-full bg-blue-50/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#C08E3E_0.6px,transparent_0.6px)] [background-size:24px_24px] opacity-10" />

      <div className="relative z-10 flex w-full max-w-[640px] flex-col items-center">
        <header className="relative z-10 mb-8 flex max-w-xl flex-col items-center text-center">
          <div className="mb-4 inline-flex w-max items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3.5 py-1.5 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-gold" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-700">
              AI-POWERED SCANNING
            </span>
          </div>
          <h2 className="font-serif text-3xl font-bold leading-tight tracking-tight text-brand-dark sm:text-4xl">
            Adaptive Skin Tone Scanner
          </h2>
          <p className="mx-auto mt-3 max-w-md font-sans text-xs font-medium leading-relaxed text-slate-500 sm:text-sm">
            The system captures multiple frames, selects the best usable frame, applies lighting correction,
            and classifies skin tone using LAB / ITA analysis.
          </p>
        </header>

        <GenderPicker
          value={gender}
          onChange={chooseGender}
          disabled={scanState === "camera" || scanState === "scanning"}
        />

        <div className="relative mt-8 aspect-[3/4] w-full max-w-[380px] select-none overflow-hidden rounded-[2rem] border-2 border-brand-gold/15 bg-white shadow-[0_20px_50px_-12px_rgba(35,33,29,0.18)] transition-all duration-500 group hover:border-brand-gold/30">
          {scanState === "camera" ? (
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full bg-slate-900 object-cover" />
          ) : previewImage ? (
            <img src={previewImage} alt="Captured face scan preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 px-6 text-center text-white">
              <div className="relative mb-5 rounded-full border border-slate-700/30 bg-slate-800/40 p-5">
                <Camera className="h-16 w-16 text-brand-gold" />
                <div className="absolute inset-0 rounded-full border border-brand-gold/30 opacity-20" />
              </div>
              <p className="mb-1 font-serif text-sm tracking-wide text-slate-200">No Face Frame Captured</p>
              <p className="max-w-[240px] text-xs leading-relaxed text-slate-400">
                {gender
                  ? "Start auto multi-frame scan or upload a face image to calibrate"
                  : "Choose Men or Women above to unlock the camera and photo upload"}
              </p>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-0 bg-slate-950/10" />

          {!gender && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/55 px-8 text-center backdrop-blur-[1px]">
              <Lock className="h-7 w-7 text-brand-gold" />
              <p className="mt-3 text-xs font-black uppercase tracking-widest text-white">Choose Men or Women first</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-200">
                We ask so the picks match you. We never guess from your face.
              </p>
            </div>
          )}

          <div className="pointer-events-none absolute left-6 top-6 z-20 h-8 w-8 rounded-tl-md border-l-2 border-t-2 border-brand-gold/70" />
          <div className="pointer-events-none absolute right-6 top-6 z-20 h-8 w-8 rounded-tr-md border-r-2 border-t-2 border-brand-gold/70" />
          <div className="pointer-events-none absolute bottom-6 left-6 z-20 h-8 w-8 rounded-bl-md border-b-2 border-l-2 border-brand-gold/70" />
          <div className="pointer-events-none absolute bottom-6 right-6 z-20 h-8 w-8 rounded-br-md border-b-2 border-r-2 border-brand-gold/70" />

          {scanState === "camera" && countdown !== null && (
            <div className="absolute left-6 right-6 top-6 z-30 rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-4 text-center text-white shadow-2xl backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">
                Multi-frame scan starting
              </p>
              <p className="mt-1.5 font-serif text-4xl font-bold text-white">{countdown}</p>
            </div>
          )}

          {scanState === "scanning" && (
            <motion.div
              initial={{ top: "10%" }}
              animate={{ top: "90%" }}
              transition={{ repeat: Infinity, repeatType: "reverse", duration: 2.2, ease: "easeInOut" }}
              className="pointer-events-none absolute left-0 z-25 h-[3px] w-full bg-gradient-to-r from-transparent via-brand-gold to-transparent shadow-[0_0_15px_4px_#C08E3E]"
            />
          )}

          {scanState === "scanning" && (
            <div className="absolute left-5 top-5 z-30 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/80 px-3.5 py-2 font-mono text-[9px] font-bold tracking-widest text-brand-gold shadow backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span>ANALYZING: {progress}%</span>
            </div>
          )}
        </div>

        <div className="mt-8 flex w-full max-w-sm flex-col items-center gap-5">
          {scanState === "scanning" && <AnalysingView progress={progress} step={activeTelemetry} />}

          {scanState === "camera" && (
            <div className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-slate-800/80 bg-slate-900/95 p-3.5 font-mono text-[10px] font-bold uppercase leading-none tracking-widest text-blue-300 shadow-xl backdrop-blur-sm">
              <Binary className="h-4 w-4 text-brand-gold" />
              <span className="text-slate-200">{activeTelemetry}</span>
            </div>
          )}

          {scanState === "retake" && (
            <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs font-bold text-amber-800 shadow-sm">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="h-4 w-4 shrink-0" />
                <span data-testid="scan-rescan-message">
                  {backendMessage || "We could not read your skin tone. Please scan again."}
                </span>
              </div>
              {qualityChecks.some((check) => check.status !== "pass") && (
                <ul data-testid="scan-quality" className="mt-3 space-y-1.5 border-t border-amber-200 pt-3">
                  {qualityChecks
                    .filter((check) => check.status !== "pass")
                    .map((check) => (
                      <li key={check.key} className="flex items-start gap-2 text-xs font-semibold text-amber-800">
                        <span
                          className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                            check.status === "fail" ? "bg-red-500" : "bg-amber-500"
                          }`}
                        />
                        {check.message}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {scanState === "error" && (
            <div className="flex w-full items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-xs font-bold text-red-700 shadow-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {gender && scanState !== "scanning" && (
            <div className="mt-1 w-full max-w-sm">
              <button
                type="button"
                onClick={() => setShowManual((current) => !current)}
                className="text-xs font-bold text-blue-800 underline underline-offset-4"
              >
                Skip, pick my tone
              </button>
              {manualVisible && (
                <div className="mt-3 space-y-3 rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-sm">
                  <p className="text-xs font-bold text-slate-600">
                    No face detected or camera unavailable? Choose the closest match.
                  </p>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Skin depth
                    <select
                      value={manualDepth}
                      onChange={(event) => setManualDepth(event.target.value as ScanDepth)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                    >
                      <option value="Fair">Fair</option>
                      <option value="Medium">Medium</option>
                      <option value="Dark">Dark</option>
                    </select>
                  </label>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Undertone
                    <select
                      value={manualUndertone}
                      onChange={(event) => setManualUndertone(event.target.value as ScanUndertone)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                    >
                      <option value="warm">Warm</option>
                      <option value="cool">Cool</option>
                      <option value="neutral">Neutral</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void submitManualTone()}
                    disabled={manualSubmitting}
                    className="w-full rounded-xl bg-slate-900 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60"
                  >
                    {manualSubmitting ? "Saving..." : "Use this tone"}
                  </button>
                </div>
              )}
            </div>
          )}

          {showStartButtons && (
            <div className="flex w-full max-w-sm items-start gap-3 rounded-2xl border border-blue-100/50 bg-blue-50/50 p-3.5 text-left shadow-sm">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
              <p className="font-sans text-xs font-medium leading-relaxed text-blue-900">
                Use clear, natural lighting and keep your face centered. The system captures and analyzes multiple
                frames automatically for highest accuracy.
              </p>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          <div className="mt-2 flex w-full flex-col gap-3.5">
            {showStartButtons && (
              <>
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  disabled={!gender}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 py-4 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-900/10 transition-all duration-300 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-4 w-4 text-white" />
                  Start Camera
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!gender}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-blue-600/30 bg-transparent py-4 text-xs font-bold uppercase tracking-widest text-blue-800 transition-all duration-300 hover:border-blue-600/60 hover:bg-blue-50/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Upload Face Image
                </button>
              </>
            )}

            {scanState === "camera" && (
              <div className="flex w-full gap-4">
                <button
                  type="button"
                  onClick={() => void captureMultipleFrames()}
                  className="flex-1 rounded-xl bg-brand-gold py-4 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-brand-gold/10 transition-all duration-300 hover:opacity-95"
                >
                  Scan Now
                </button>
                <button
                  type="button"
                  onClick={resetScan}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-blue-600/30 bg-transparent py-4 text-xs font-bold uppercase tracking-wider text-blue-800 transition-all duration-300 hover:border-blue-600/60 hover:bg-blue-50/50"
                >
                  Cancel
                </button>
              </div>
            )}

            {scanState === "retake" && (
              <button
                type="button"
                onClick={resetScan}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-blue-600/30 bg-transparent py-4 text-xs font-bold uppercase tracking-widest text-blue-800 transition-all duration-300 hover:border-blue-600/60 hover:bg-blue-50/50"
              >
                <RefreshCw className="h-4 w-4" />
                Scan again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
