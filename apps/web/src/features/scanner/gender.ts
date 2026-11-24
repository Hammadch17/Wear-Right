/** Shared naming for the scan flow: the shopper's gender, the detected depth and the mannequin's skin names. */

export type ScanGender = "men" | "women";
export type ScanDepth = "Fair" | "Medium" | "Dark";
export type ScanUndertone = "warm" | "cool" | "neutral";

/** The profile stores male/female/unspecified; the scanner asks Men or Women and never infers it from a face. */
export function genderFromProfile(gender?: string | null): ScanGender | null {
  const value = (gender || "").toLowerCase();
  if (value === "male" || value === "men") return "men";
  if (value === "female" || value === "women") return "women";
  return null;
}

export function profileGender(gender: ScanGender): "male" | "female" {
  return gender === "women" ? "female" : "male";
}

/** Fair / Medium / Dark from the scan API, including the legacy `detected_skin_tone` field. */
export function normaliseDepth(tone?: string | null): ScanDepth {
  const value = (tone || "").toLowerCase();
  if (value.includes("fair") || value.includes("light")) return "Fair";
  if (value.includes("dark") || value.includes("deep")) return "Dark";
  return "Medium";
}

export function toneKey(tone: ScanDepth): "fair" | "medium" | "dark" {
  return tone.toLowerCase() as "fair" | "medium" | "dark";
}

/** The dressing room has three painted skins; Medium uses its wheatish photo. */
export function mannequinSkin(tone: ScanDepth): "fair" | "wheatish" | "dark" {
  if (tone === "Fair") return "fair";
  if (tone === "Dark") return "dark";
  return "wheatish";
}

/** The result page shows a word, not the raw percentage. */
export function confidenceWord(score?: number | null): "High" | "Medium" | "Low" {
  const value = Number(score ?? 0);
  if (value >= 75) return "High";
  if (value >= 50) return "Medium";
  return "Low";
}

/** A representative swatch per depth, used beside the result headline. */
export const TONE_SWATCH: Record<ScanDepth, string> = {
  Fair: "#f0c8a8",
  Medium: "#c98a5f",
  Dark: "#7a4a32",
};
