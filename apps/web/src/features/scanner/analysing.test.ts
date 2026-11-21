import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ANALYSING_MIN_MS, analysingRemaining, waitForAnalysing } from "./analysing";

describe("analysing screen timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the screen up for at least the minimum when the server answers instantly", async () => {
    const startedAt = Date.now();
    let landed = false;

    const flow = (async () => {
      await Promise.resolve({ status: "success" });
      await waitForAnalysing(startedAt);
      landed = true;
    })();

    await vi.advanceTimersByTimeAsync(ANALYSING_MIN_MS - 1);
    expect(landed).toBe(false);
    expect(analysingRemaining(startedAt)).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await flow;
    expect(landed).toBe(true);
  });

  it("waits for a slow server instead of cutting the request off", async () => {
    const startedAt = Date.now();
    vi.advanceTimersByTime(ANALYSING_MIN_MS + 1500);
    expect(analysingRemaining(startedAt)).toBe(0);

    let landed = false;
    const flow = waitForAnalysing(startedAt).then(() => {
      landed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    await flow;
    expect(landed).toBe(true);
  });

  it("never opens a result when the request fails", async () => {
    const startedAt = Date.now();
    let landed = false;

    const flow = (async () => {
      try {
        await Promise.reject(new Error("scan failed"));
        await waitForAnalysing(startedAt);
        landed = true;
      } catch {
        // The scanner keeps the retake message on its own page.
      }
    })();

    await vi.advanceTimersByTimeAsync(ANALYSING_MIN_MS * 3);
    await flow;
    expect(landed).toBe(false);
  });
});
