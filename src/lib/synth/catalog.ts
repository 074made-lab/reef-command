/**
 * Synthetic coral store catalog. Three public TIA product names pair with
 * owner-authorized photos in the report UI; their prices, rankings, bids, and
 * events remain invented. No production store data is used here.
 *
 * Six reporting categories (Task 4): zoas, euphyllia, goni, mushroom, sps, other.
 */

import type { CoralCategory } from "../protocol";

export type CatalogItem = {
  sku: string;
  name: string;
  genus: string;
  category: CoralCategory;
  careLevel: "beginner" | "intermediate" | "expert";
  basePriceCents: number;
  auctionable: boolean;
};

const LINES: [genus: string, category: CoralCategory, names: string[],
  care: CatalogItem["careLevel"], baseUsd: number, auctionable: boolean][] = [
  ["Euphyllia", "euphyllia", ["Gold Torch", "Dragon Torch", "Purple Hammer", "Green Hammer", "Frogspawn Branch", "Cristata Crown"], "intermediate", 120, true],
  ["Zoanthus", "zoas", ["Sunburst Zoa", "Lava Lamp Zoa", "Midnight Zoa", "Citrus Splash Zoa", "Storm Cloud Zoa", "Dragon Eye Zoa"], "beginner", 35, true],
  ["Goniopora", "goni", ["Red Goni", "Rainbow Goni", "Green Metallic Goni", "Sparkleball Glitter Goniopora"], "intermediate", 70, true],
  ["Discosoma", "mushroom", ["Cherry Mushroom", "Marble Mushroom", "Neon Green Shroom"], "beginner", 25, false],
  ["Rhodactis", "mushroom", ["Bounce Mushroom", "Toxic Velvet Bounce Mushroom", "Orange Crush Bounce"], "intermediate", 150, true],
  ["Acropora", "sps", ["Blue Stag Acro", "Pink Millepora", "Sunset Tabling Acro", "Teal Tip Acro"], "expert", 90, true],
  ["Montipora", "sps", ["Rainbow Monti Cap", "Forest Fire Digitata", "Sunset Monti"], "intermediate", 45, false],
  ["Caulastraea", "other", ["Neon Candy Cane", "Pastel Candy Cane"], "beginner", 40, false],
  ["Favia", "other", ["Dragon Soul Favia", "Reverse Prism Favia"], "intermediate", 60, true],
  ["Chalice", "other", ["Opposite Day Chalice", "Blueberry Chalice"], "expert", 110, true],
];

export const CATALOG: CatalogItem[] = LINES.flatMap(([genus, category, names, careLevel, baseUsd, auctionable], li) =>
  names.map((name, ni) => ({
    sku: `RC-${String(li + 1).padStart(2, "0")}${String(ni + 1).padStart(2, "0")}`,
    name,
    genus,
    category,
    careLevel,
    basePriceCents: Math.round(baseUsd * (0.8 + 0.4 * ((ni * 7 + li * 3) % 10) / 10)) * 100,
    auctionable,
  }))
);

export const AUCTIONABLE = CATALOG.filter((c) => c.auctionable);

export type Destination = { city: string; coldProne: boolean; hotProne: boolean };

export const DESTINATIONS: Destination[] = [
  { city: "Denver, CO", coldProne: true, hotProne: false },
  { city: "Austin, TX", coldProne: false, hotProne: true },
  { city: "Seattle, WA", coldProne: true, hotProne: false },
  { city: "Miami, FL", coldProne: false, hotProne: true },
  { city: "Chicago, IL", coldProne: true, hotProne: false },
  { city: "Phoenix, AZ", coldProne: false, hotProne: true },
  { city: "Boston, MA", coldProne: true, hotProne: false },
  { city: "Minneapolis, MN", coldProne: true, hotProne: false },
  { city: "Atlanta, GA", coldProne: false, hotProne: true },
  { city: "Portland, OR", coldProne: false, hotProne: false },
  { city: "Brooklyn, NY", coldProne: false, hotProne: false },
  { city: "San Diego, CA", coldProne: false, hotProne: false },
  { city: "Nashville, TN", coldProne: false, hotProne: false },
  { city: "Columbus, OH", coldProne: true, hotProne: false },
  { city: "Tampa, FL", coldProne: false, hotProne: true },
];
