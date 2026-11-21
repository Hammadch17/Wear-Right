import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TonePicksResponse } from "@/features/recommender/api";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setSkinTone: vi.fn(),
  tonePicks: vi.fn(),
  manual: vi.fn(),
  saved: null as null | {
    tone: "Fair" | "Medium" | "Dark";
    undertone: "warm" | "cool" | "neutral" | null;
    confidence: number;
    monk: number | null;
    gender: "men" | "women";
  },
  listeners: new Set<() => void>(),
}));

vi.mock("@/lib/navigation", () => ({ useNavigate: () => mocks.navigate }));

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ setSkinTone: mocks.setSkinTone }),
}));

vi.mock("@/features/scanner/savedScan", () => ({
  savedScanStore: {
    subscribe: (listener: () => void) => {
      mocks.listeners.add(listener);
      return () => mocks.listeners.delete(listener);
    },
    getSnapshot: () => mocks.saved,
    getServerSnapshot: () => mocks.saved,
    set: (value: typeof mocks.saved) => {
      mocks.saved = value;
      mocks.listeners.forEach((listener) => listener());
    },
  },
}));

vi.mock("@/features/scanner/api", () => ({
  scannerApi: { manual: mocks.manual },
}));

vi.mock("@/features/recommender/api", () => ({
  recommenderApi: { tonePicks: mocks.tonePicks },
}));

import ScannerResultView from "./ScannerResultView";

function card(id: number, name: string) {
  return {
    id,
    name,
    price: "2000",
    color_name: "Navy Blue",
    color_hex: "#000080",
    image: null,
  };
}

function body(tone = "Fair", gender = "men"): TonePicksResponse {
  return {
    status: "success",
    tone,
    gender,
    undertone: "warm",
    groups: [
      {
        key: gender === "women" ? "tops" : "shirts",
        label: gender === "women" ? "Tops" : "Shirts",
        slots: ["top"],
        short: false,
        items: [card(1, "Navy Shirt"), card(2, "White Shirt")],
      },
      {
        key: gender === "women" ? "bottoms" : "pants",
        label: gender === "women" ? "Bottoms" : "Pants",
        slots: ["bottom"],
        short: false,
        items: [card(3, "Black Trouser"), card(4, "Beige Chino")],
      },
      { key: "caps", label: "Caps", slots: ["headwear"], short: true, items: [card(5, "Blue Cap")] },
      {
        key: "glasses",
        label: "Glasses",
        slots: ["eyewear"],
        short: false,
        items: [card(6, "Black Sunglasses"), card(7, "Gold Sunglasses")],
      },
    ],
    short_groups: ["caps"],
  };
}

function saved(gender: "men" | "women" = "men", tone: "Fair" | "Medium" | "Dark" = "Fair") {
  mocks.saved = { tone, undertone: "warm", confidence: 88, monk: 4, gender };
}

describe("ScannerResultView", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.setSkinTone.mockReset();
    mocks.tonePicks.mockReset();
    mocks.manual.mockReset();
    mocks.saved = null;
    mocks.listeners.clear();
  });

  it("sends the shopper back to the scanner when there is no saved scan", async () => {
    render(<ScannerResultView />);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/scanner"));
    expect(screen.queryByTestId("scanner-result")).not.toBeInTheDocument();
  });

  it("shows the tone, word confidence, four groups and the short-group note", async () => {
    saved();
    mocks.tonePicks.mockResolvedValue(body());

    render(<ScannerResultView />);

    expect(await screen.findByTestId("result-tone")).toHaveTextContent("Your skin tone: Fair");
    expect(screen.getByTestId("result-undertone")).toHaveTextContent("warm undertone");
    expect(screen.getByTestId("result-confidence")).toHaveTextContent("High confidence");
    expect(screen.getByText("Men's picks for Fair skin")).toBeInTheDocument();

    await screen.findByTestId("tone-group-shirts");
    expect(screen.getByTestId("tone-group-pants")).toBeInTheDocument();
    expect(screen.getByTestId("tone-group-caps")).toBeInTheDocument();
    expect(screen.getByTestId("tone-group-glasses")).toBeInTheDocument();
    expect(screen.getByTestId("tone-group-short-caps")).toHaveTextContent(
      "Only 1 caps available for this tone right now.",
    );
    expect(screen.getAllByText("Try on mannequin")).toHaveLength(7);
    expect(mocks.tonePicks).toHaveBeenCalledWith({ tone: "fair", gender: "men", undertone: "warm" });
  });

  it("opens a product, carries gender and skin to the mannequin, and links to all matches", async () => {
    saved();
    mocks.tonePicks.mockResolvedValue(body());
    const user = userEvent.setup();
    render(<ScannerResultView />);

    const first = await screen.findByTestId("tone-pick-1");
    await user.click(within(first).getByRole("button", { name: "Open Navy Shirt" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/product/1");

    await user.click(within(first).getByRole("button", { name: /Try on mannequin/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/mannequin?gender=men&skin=fair");

    await user.click(screen.getByRole("button", { name: /See all my matches/i }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/recommended?skinTone=fair&undertone=warm&confidence=88&gender=men&theme=palette",
    );

    await user.click(screen.getByRole("button", { name: /Open dressing room/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/mannequin?gender=men&skin=fair");
  });

  it("changes the tone and picks in place without a rescan and keeps the new result", async () => {
    saved();
    mocks.tonePicks.mockImplementation(({ tone }: { tone: string }) =>
      Promise.resolve(body(tone === "dark" ? "Dark" : "Fair")),
    );
    mocks.manual.mockResolvedValue({
      status: "success",
      depth: "Dark",
      detected_skin_tone: "Dark",
      undertone: "cool",
      confidence: 100,
      confidence_score: 100,
    });
    const user = userEvent.setup();

    render(<ScannerResultView />);
    await screen.findByTestId("tone-group-shirts");

    await user.click(screen.getByRole("button", { name: /Not right\? Choose mine/i }));
    await user.click(screen.getByTestId("result-tone-dark"));

    await waitFor(() => expect(mocks.setSkinTone).toHaveBeenCalledWith("Dark"));
    expect(mocks.manual).toHaveBeenCalledWith("Dark", "warm");
    expect(mocks.saved?.tone).toBe("Dark");
    expect(screen.getByTestId("result-tone")).toHaveTextContent("Your skin tone: Dark");
    await waitFor(() =>
      expect(mocks.tonePicks).toHaveBeenLastCalledWith({ tone: "dark", gender: "men", undertone: "cool" }),
    );
    expect(screen.getByText("Men's picks for Dark skin")).toBeInTheDocument();
  });

  it("uses the women's groups for a women's scan", async () => {
    saved("women", "Medium");
    mocks.tonePicks.mockResolvedValue(body("Medium", "women"));

    render(<ScannerResultView />);

    expect(await screen.findByText("Women's picks for Medium skin")).toBeInTheDocument();
    await screen.findByTestId("tone-group-tops");
    expect(screen.getByTestId("tone-group-bottoms")).toBeInTheDocument();
    expect(screen.queryByTestId("tone-group-shirts")).not.toBeInTheDocument();
  });

  it("forgets the scan when the shopper scans again", async () => {
    saved();
    mocks.tonePicks.mockResolvedValue(body());
    const user = userEvent.setup();
    render(<ScannerResultView />);

    await screen.findByTestId("tone-group-shirts");
    await user.click(screen.getByRole("button", { name: /Scan again/i }));

    expect(mocks.saved).toBeNull();
    expect(mocks.navigate).toHaveBeenCalledWith("/scanner");
  });
});
