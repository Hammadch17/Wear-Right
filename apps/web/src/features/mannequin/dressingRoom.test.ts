import { describe, expect, it } from "vitest";
import type { AlphaItem, AlphaWardrobe } from "./api";
import type { Outfit } from "./dressingRoom";
import {
  allImageUrls,
  defaultOutfit,
  hasProduct,
  layerStack,
  outfitTotal,
  shuffleOutfit,
  toggleItem,
  wornItems,
} from "./dressingRoom";

const item = (id: number, over: Partial<AlphaItem> = {}): AlphaItem => ({
  product_id: id,
  name: `Item ${id}`,
  price: 1000 * id,
  image: `/media/products/${id}.png`,
  layer: `/media/mannequin_alpha/layers/men-${id}.png`,
  available: true,
  ...over,
});

const wardrobe: AlphaWardrobe = {
  status: "success",
  gender: "men",
  base: {
    image: "/media/mannequin_alpha/base/men.jpg",
    base_top: "/media/mannequin_alpha/base/men-top.png",
    base_bottom: "/media/mannequin_alpha/base/men-bottom.png",
    width: 960,
    height: 1280,
    label: "AI-generated model",
  },
  z_order: {
    shoes: 1,
    bottom: 2,
    base_bottom: 2,
    top: 3,
    kurta: 3,
    base_top: 3,
    outerwear: 4,
    watch: 5,
    eyewear: 6,
    headwear: 7,
  },
  slots: [
    { slot: "top", label: "Shirts", items: [item(1), item(2)] },
    { slot: "kurta", label: "Kurtas", items: [item(7)] },
    { slot: "outerwear", label: "Waistcoats & blazers", items: [item(8)] },
    { slot: "bottom", label: "Trousers", items: [item(3), item(4)] },
    { slot: "shoes", label: "Shoes", items: [item(5)] },
    { slot: "watch", label: "Watches", items: [item(6, { available: false })] },
    { slot: "eyewear", label: "Sunglasses", items: [item(9)] },
    { slot: "headwear", label: "Caps", items: [item(10)] },
  ],
};

const outfit = (over: Partial<Outfit> = {}): Outfit => ({
  top: null,
  kurta: null,
  outerwear: null,
  bottom: null,
  shoes: null,
  watch: null,
  eyewear: null,
  headwear: null,
  ...over,
});

describe("defaultOutfit", () => {
  it("wears the first shirt, trousers, shoes and watch, and leaves the extras off", () => {
    expect(defaultOutfit(wardrobe)).toEqual(outfit({ top: 1, bottom: 3, shoes: 5, watch: 6 }));
  });

  it("puts the product from the link in its slot", () => {
    expect(defaultOutfit(wardrobe, 4)).toEqual(outfit({ top: 1, bottom: 4, shoes: 5, watch: 6 }));
  });

  it("wears a kurta from the link and takes the shirt off", () => {
    expect(defaultOutfit(wardrobe, 7)).toEqual(outfit({ kurta: 7, bottom: 3, shoes: 5, watch: 6 }));
  });

  it("wears a shirt from the link and leaves the kurta off", () => {
    expect(defaultOutfit(wardrobe, 2)).toEqual(outfit({ top: 2, bottom: 3, shoes: 5, watch: 6 }));
  });

  it("ignores a product that is not in the alpha", () => {
    expect(defaultOutfit(wardrobe, 99)).toEqual(defaultOutfit(wardrobe));
  });
});

describe("layerStack", () => {
  it("draws shoes, then trousers, then the shirt, then the watch", () => {
    const keys = layerStack(wardrobe, outfit({ top: 2, bottom: 4, shoes: 5, watch: 6 })).map((layer) => layer.key);
    expect(keys).toEqual(["shoes-5", "bottom-4", "top-2", "watch-6"]);
  });

  it("adds the base trousers under a shirt when no trousers are chosen", () => {
    const keys = layerStack(wardrobe, outfit({ top: 1 })).map((layer) => layer.key);
    expect(keys).toEqual(["base-bottom", "top-1"]);
  });

  it("adds the base trousers under a kurta when no trousers are chosen", () => {
    const keys = layerStack(wardrobe, outfit({ kurta: 7 })).map((layer) => layer.key);
    expect(keys).toEqual(["base-bottom", "kurta-7"]);
  });

  it("redraws the base tee over chosen trousers when no shirt or kurta is chosen", () => {
    const keys = layerStack(wardrobe, outfit({ bottom: 3 })).map((layer) => layer.key);
    expect(keys).toEqual(["bottom-3", "base-top"]);
  });

  it("does not redraw the base tee when a kurta is worn with trousers", () => {
    const keys = layerStack(wardrobe, outfit({ kurta: 7, bottom: 3 })).map((layer) => layer.key);
    expect(keys).toEqual(["bottom-3", "kurta-7"]);
  });

  it("draws outerwear over a kurta and eyewear/headwear over everything below", () => {
    const keys = layerStack(
      wardrobe,
      outfit({ bottom: 3, kurta: 7, outerwear: 8, watch: 6, eyewear: 9, headwear: 10 }),
    ).map((layer) => layer.key);
    expect(keys).toEqual(["bottom-3", "kurta-7", "outerwear-8", "watch-6", "eyewear-9", "headwear-10"]);
  });

  it("is empty when nothing is imported", () => {
    expect(layerStack({ ...wardrobe, base: null }, defaultOutfit(wardrobe))).toEqual([]);
  });
});

describe("outfit helpers", () => {
  it("toggles an item off when it is picked again", () => {
    const worn = defaultOutfit(wardrobe);
    expect(toggleItem(worn, "top", 1).top).toBeNull();
    expect(toggleItem(worn, "top", 2).top).toBe(2);
  });

  it("replaces a shirt with a kurta and the other way round", () => {
    const withKurta = toggleItem(defaultOutfit(wardrobe), "kurta", 7);
    expect(withKurta.kurta).toBe(7);
    expect(withKurta.top).toBeNull();

    const withTop = toggleItem(withKurta, "top", 2);
    expect(withTop.top).toBe(2);
    expect(withTop.kurta).toBeNull();
  });

  it("lists what is worn and adds up the prices", () => {
    const worn = outfit({ top: 2, shoes: 5 });
    expect(wornItems(wardrobe, worn).map((entry) => entry.label)).toEqual(["Shirts", "Shoes"]);
    expect(outfitTotal(wardrobe, worn)).toBe(7000);
  });

  it("lists a kurta and its extras when they are worn", () => {
    const worn = outfit({ kurta: 7, outerwear: 8, eyewear: 9, headwear: 10 });
    expect(wornItems(wardrobe, worn).map((entry) => entry.label)).toEqual([
      "Kurtas",
      "Waistcoats & blazers",
      "Sunglasses",
      "Caps",
    ]);
    expect(outfitTotal(wardrobe, worn)).toBe(34000);
  });

  it("shuffles to a real shirt outfit with no extras when the coin says no", () => {
    expect(shuffleOutfit(wardrobe, () => 0.99)).toEqual(
      outfit({ top: 2, bottom: 4, shoes: 5, watch: 6 }),
    );
  });

  it("shuffles to a kurta and all extras when the coin says yes", () => {
    expect(shuffleOutfit(wardrobe, () => 0.1)).toEqual(
      outfit({ kurta: 7, outerwear: 8, bottom: 3, shoes: 5, watch: 6, eyewear: 9, headwear: 10 }),
    );
  });

  it("never shuffles both a shirt and a kurta", () => {
    for (const random of [() => 0.1, () => 0.99, Math.random, Math.random]) {
      const shuffled = shuffleOutfit(wardrobe, random);
      expect([shuffled.top, shuffled.kurta].filter((id) => id !== null)).toHaveLength(1);
    }
  });

  it("knows which products are on the mannequin and what to preload", () => {
    expect(hasProduct(wardrobe, 3)).toBe(true);
    expect(hasProduct(wardrobe, 7)).toBe(true);
    expect(hasProduct(wardrobe, 99)).toBe(false);
    expect(allImageUrls(wardrobe)).toHaveLength(3 + 10);
  });
});
