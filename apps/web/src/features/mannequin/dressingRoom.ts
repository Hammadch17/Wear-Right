import type { AlphaItem, AlphaSlot, AlphaWardrobe } from "./api";

/** What the mannequin wears: one product id per slot, or null for the base photo's own clothes. */
export type Outfit = Record<AlphaSlot, number | null>;

export type StackLayer = { key: string; src: string; z: number };

const BASE_SLOTS: AlphaSlot[] = ["top", "bottom", "shoes", "watch"];
const EXTRA_SLOTS: AlphaSlot[] = ["outerwear", "eyewear", "headwear"];
/** A kurta replaces a shirt and the other way round; the other parts can be added freely. */
const EXCLUSIVE: Partial<Record<AlphaSlot, AlphaSlot>> = { top: "kurta", kurta: "top" };

const EMPTY: Outfit = {
  top: null,
  kurta: null,
  outerwear: null,
  bottom: null,
  shoes: null,
  watch: null,
  eyewear: null,
  headwear: null,
};
const DEFAULT_Z: Record<string, number> = {
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
};

function itemsFor(wardrobe: AlphaWardrobe, slot: AlphaSlot): AlphaItem[] {
  return wardrobe.slots.find((entry) => entry.slot === slot)?.items ?? [];
}

export function findItem(wardrobe: AlphaWardrobe, slot: AlphaSlot, productId: number | null): AlphaItem | null {
  if (productId === null) return null;
  const row = wardrobe.slots.find((entry) => entry.slot === slot);
  return row?.items.find((item) => item.product_id === productId) ?? null;
}

export function slotOfProduct(wardrobe: AlphaWardrobe, productId: number): AlphaSlot | null {
  const row = wardrobe.slots.find((entry) => entry.items.some((item) => item.product_id === productId));
  return row ? row.slot : null;
}

export function hasProduct(wardrobe: AlphaWardrobe, productId: number): boolean {
  return wardrobe.base !== null && slotOfProduct(wardrobe, productId) !== null;
}

/**
 * The plain default outfit: first shirt, trousers, shoes and watch.
 * Kurtas, waistcoats/blazers, sunglasses and caps are opt-in, so the mannequin starts simple.
 * A `focusProductId` (from ?product=) is still worn in its slot and clears its exclusive partner.
 */
export function defaultOutfit(wardrobe: AlphaWardrobe, focusProductId?: number | null): Outfit {
  const outfit: Outfit = { ...EMPTY };
  for (const slot of BASE_SLOTS) outfit[slot] = itemsFor(wardrobe, slot)[0]?.product_id ?? null;
  if (focusProductId != null) {
    const slot = slotOfProduct(wardrobe, focusProductId);
    if (slot) {
      outfit[slot] = focusProductId;
      const other = EXCLUSIVE[slot];
      if (other) outfit[other] = null;
    }
  }
  return outfit;
}

/** Picking the item already worn takes it off (the base clothes show again). */
export function toggleItem(outfit: Outfit, slot: AlphaSlot, productId: number): Outfit {
  const next = outfit[slot] === productId ? null : productId;
  const updated = { ...outfit, [slot]: next };
  if (next !== null) {
    const other = EXCLUSIVE[slot];
    if (other) updated[other] = null;
  }
  return updated;
}

/**
 * The <img> layers to draw over the base photo, lowest first.
 * - A top or kurta without a chosen bottom draws the base's trousers (their waist extension fills under a short shirt).
 * - A bottom without a chosen top or kurta redraws the base tee, so the bottom's waist extension does not crop it.
 */
export function layerStack(wardrobe: AlphaWardrobe, outfit: Outfit): StackLayer[] {
  const base = wardrobe.base;
  if (!base) return [];
  const z = { ...DEFAULT_Z, ...wardrobe.z_order };
  const layers: StackLayer[] = [];
  (Object.keys(EMPTY) as AlphaSlot[]).forEach((slot) => {
    const item = findItem(wardrobe, slot, outfit[slot]);
    if (item) layers.push({ key: `${slot}-${item.product_id}`, src: item.layer, z: z[slot] });
  });
  const wearsTop =
    findItem(wardrobe, "top", outfit.top) !== null || findItem(wardrobe, "kurta", outfit.kurta) !== null;
  const wearsBottom = findItem(wardrobe, "bottom", outfit.bottom) !== null;
  if (wearsTop && !wearsBottom && base.base_bottom) layers.push({ key: "base-bottom", src: base.base_bottom, z: z.base_bottom });
  if (wearsBottom && !wearsTop && base.base_top) layers.push({ key: "base-top", src: base.base_top, z: z.base_top });
  return layers.sort((a, b) => a.z - b.z);
}

export function wornItems(wardrobe: AlphaWardrobe, outfit: Outfit): Array<{ slot: AlphaSlot; label: string; item: AlphaItem }> {
  return wardrobe.slots.flatMap((row) => {
    const item = findItem(wardrobe, row.slot, outfit[row.slot]);
    return item ? [{ slot: row.slot, label: row.label, item }] : [];
  });
}

export function outfitTotal(wardrobe: AlphaWardrobe, outfit: Outfit): number {
  return wornItems(wardrobe, outfit).reduce((sum, entry) => sum + Number(entry.item.price || 0), 0);
}

/**
 * A random outfit: one of shirt/kurta, always trousers, shoes and watch when available,
 * and each extra (outerwear, sunglasses, cap) with a 50% chance.
 */
export function shuffleOutfit(wardrobe: AlphaWardrobe, random: () => number = Math.random): Outfit {
  const outfit: Outfit = { ...EMPTY };
  const pick = (slot: AlphaSlot): number | null => {
    const items = itemsFor(wardrobe, slot);
    if (!items.length) return null;
    return items[Math.min(items.length - 1, Math.floor(random() * items.length))].product_id;
  };

  const hasTop = itemsFor(wardrobe, "top").length > 0;
  const hasKurta = itemsFor(wardrobe, "kurta").length > 0;
  if (hasTop || hasKurta) {
    const chooseKurta = hasKurta && (!hasTop || random() < 0.5);
    const slot = chooseKurta ? "kurta" : "top";
    outfit[slot] = pick(slot);
  }
  for (const slot of ["bottom", "shoes", "watch"] as AlphaSlot[]) outfit[slot] = pick(slot);
  for (const slot of EXTRA_SLOTS) {
    if (random() < 0.5) outfit[slot] = pick(slot);
  }
  return outfit;
}

/** Every image the page may show, to preload so swapping is instant. */
export function allImageUrls(wardrobe: AlphaWardrobe): string[] {
  if (!wardrobe.base) return [];
  const { image, base_top, base_bottom } = wardrobe.base;
  const layers = wardrobe.slots.flatMap((row) => row.items.map((item) => item.layer));
  return [image, base_top, base_bottom, ...layers].filter((url): url is string => Boolean(url));
}
