import { createLocalStore } from "@/features/storage/localStore";
import type { ScanDepth, ScanGender, ScanUndertone } from "./gender";

/** What the result page needs after the scanner navigates away. */
export type SavedScan = {
  tone: ScanDepth;
  undertone: ScanUndertone | null;
  confidence: number;
  monk: number | null;
  gender: ScanGender;
};

/** The latest scan, kept for reloads and for the result page. */
export const savedScanStore = createLocalStore<SavedScan | null>("wr-scan-result", null);

/** The Men/Women choice, kept separately so the scanner can prefill before a scan exists. */
export const scanGenderStore = createLocalStore<ScanGender | null>("wr-scan-gender", null);
