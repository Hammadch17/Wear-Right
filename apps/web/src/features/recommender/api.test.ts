import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiGet: vi.fn().mockResolvedValue({ status: "success" }) }));

import { apiGet } from "@/lib/api";
import { recommenderApi } from "./api";

describe("recommenderApi", () => {
  beforeEach(() => vi.mocked(apiGet).mockClear());

  it("sends only the shopper parameters that are set, in a query string", async () => {
    await recommenderApi.topPicks({ depth: "Medium", undertone: "warm", style: "", limit: 15 });
    expect(apiGet).toHaveBeenCalledWith("/api/recommendations/top/?depth=Medium&undertone=warm&limit=15");
  });

  it("asks for the bare endpoint when nothing is known about the shopper", async () => {
    await recommenderApi.topPicks();
    expect(apiGet).toHaveBeenCalledWith("/api/recommendations/top/");
  });

  it("puts the product id first when completing a look", async () => {
    await recommenderApi.completeLook(42, { depth: "Dark", undertone: "cool" });
    expect(apiGet).toHaveBeenCalledWith("/api/looks/complete/?product_id=42&depth=Dark&undertone=cool");
  });

  it("fetches the palette for a depth and undertone", async () => {
    await recommenderApi.palette({ depth: "Fair", undertone: "neutral" });
    expect(apiGet).toHaveBeenCalledWith("/api/tone-rules/palette/?depth=Fair&undertone=neutral");
  });

  it("asks for tone picks with the gender and optional undertone", async () => {
    await recommenderApi.tonePicks({ tone: "fair", gender: "women", undertone: "warm" });
    expect(apiGet).toHaveBeenCalledWith("/api/recommendations/tone-picks/?tone=fair&gender=women&undertone=warm");
    await recommenderApi.tonePicks({ tone: "dark", gender: "men" });
    expect(apiGet).toHaveBeenLastCalledWith("/api/recommendations/tone-picks/?tone=dark&gender=men");
  });
});
