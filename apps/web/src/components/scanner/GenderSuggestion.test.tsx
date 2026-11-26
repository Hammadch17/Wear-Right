import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GenderDetection } from "@/features/scanner/api";
import GenderSuggestion from "./GenderSuggestion";

const detection: GenderDetection = {
  suggested: "women",
  probabilities: { women: 0.58, men: 0.42 },
  confidence: 58,
  confidence_label: "medium",
  agreement: 0.67,
  frames_used: 3,
  model: "test",
  reasons: ["2 of 3 usable frames agree", "Lighting was normal"],
};

describe("GenderSuggestion", () => {
  it("shows the tentative answer, its confidence and the evidence, then asks", () => {
    render(<GenderSuggestion detection={detection} onChoose={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText("Looks like Women. Is that right?")).toBeInTheDocument();
    expect(screen.getByText(/58% confidence/)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 usable frames agree/)).toBeInTheDocument();
  });

  it("chooses either section by hand and can rescan", () => {
    const onChoose = vi.fn();
    const onRetry = vi.fn();
    render(<GenderSuggestion detection={null} onChoose={onChoose} onRetry={onRetry} />);
    expect(screen.getByText("Which section should we style?")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("gender-suggestion-men"));
    expect(onChoose).toHaveBeenCalledWith("men");
    fireEvent.click(screen.getByText("Scan again"));
    expect(onRetry).toHaveBeenCalled();
  });
});
