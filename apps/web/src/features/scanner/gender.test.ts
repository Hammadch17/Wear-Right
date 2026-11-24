import { describe, expect, it } from "vitest";

import {
  confidenceWord,
  genderFromProfile,
  mannequinSkin,
  normaliseDepth,
  profileGender,
  toneKey,
} from "./gender";

describe("scanner gender and tone helpers", () => {
  it("maps a saved profile gender to the shop's tab", () => {
    expect(genderFromProfile("male")).toBe("men");
    expect(genderFromProfile("female")).toBe("women");
    expect(genderFromProfile("men")).toBe("men");
    expect(genderFromProfile("women")).toBe("women");
  });

  it("never guesses a gender when the profile has none", () => {
    expect(genderFromProfile("unspecified")).toBeNull();
    expect(genderFromProfile(null)).toBeNull();
    expect(genderFromProfile(undefined)).toBeNull();
  });

  it("maps a chosen tab back to the profile value", () => {
    expect(profileGender("men")).toBe("male");
    expect(profileGender("women")).toBe("female");
  });

  it("normalises the server's depth names", () => {
    expect(normaliseDepth("Fair")).toBe("Fair");
    expect(normaliseDepth("light")).toBe("Fair");
    expect(normaliseDepth("Medium")).toBe("Medium");
    expect(normaliseDepth("Dark")).toBe("Dark");
    expect(normaliseDepth("deep")).toBe("Dark");
    expect(normaliseDepth(undefined)).toBe("Medium");
  });

  it("turns Fair / Medium / Dark into the keys the pages use", () => {
    expect(toneKey("Fair")).toBe("fair");
    expect(toneKey("Medium")).toBe("medium");
    expect(toneKey("Dark")).toBe("dark");
    expect(mannequinSkin("Fair")).toBe("fair");
    expect(mannequinSkin("Medium")).toBe("wheatish");
    expect(mannequinSkin("Dark")).toBe("dark");
  });

  it("shows a confidence word instead of a raw percentage", () => {
    expect(confidenceWord(92)).toBe("High");
    expect(confidenceWord(75)).toBe("High");
    expect(confidenceWord(60)).toBe("Medium");
    expect(confidenceWord(50)).toBe("Medium");
    expect(confidenceWord(20)).toBe("Low");
    expect(confidenceWord(undefined)).toBe("Low");
  });
});
