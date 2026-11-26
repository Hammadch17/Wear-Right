import { createLocalStore } from "@/features/storage/localStore";
import type { GenderDetection } from "./api";
import type { ScanDepth, ScanGender, ScanUndertone } from "./gender";

/** What the result page needs after the scanner navigates away. */
export type SavedScan = {
  tone: ScanDepth;
  undertone: ScanUndertone | null;
  confidence: number;
  monk: number | null;
  gender: ScanGender;
  /** Why the scan suggested that section; absent for a manual tone or an older saved scan. */
  genderDetection?: GenderDetection | null;
};

/** The latest scan, kept for reloads and for the result page. */
export const savedScanStore = createLocalStore<SavedScan | null>("wr-scan-result", null);
