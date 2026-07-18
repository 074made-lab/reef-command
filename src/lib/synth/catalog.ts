/**
 * Synthetic coral store catalog. All names are generic coral-trade terms;
 * no real store's data is used anywhere in this project.
 */

export type CatalogItem = {
  sku: string;
  name: string;
  genus: string;
  careLevel: "beginner" | "intermediate" | "expert";
  basePriceUsd: number;
  auctionable: boolean;
};

const LINES: [genus: string, names: string[], care: CatalogItem["careLevel"], base: number, auctionable: boolean][] = [
  ["Euphyllia", ["Gold Torch", "Dragon Torch", "Purple Hammer", "Green Hammer", "Frogspawn Branch"], "intermediate", 120, true],
  ["Zoanthus", ["Sunburst Zoa", "Lava Lamp Zoa", "Midnight Zoa", "Citrus Splash Zoa", "Storm Cloud Zoa"], "beginner", 35, true],
  ["Acropora", ["Blue Stag Acro", "Pink Millepora", "Sunset Tabling Acro", "Teal Tip Acro"], "expert", 90, true],
  ["Montipora", ["Rainbow Monti Cap", "Forest Fire Digitata", "Sunset Monti"], "intermediate", 45, false],
  ["Discosoma", ["Cherry Mushroom", "Marble Mushroom", "Neon Green Shroom"], "beginner", 25, false],
  ["Rhodactis", ["Bounce Mushroom", "Galaxy Bounce"], "intermediate", 150, true],
  ["Caulastraea", ["Neon Candy Cane", "Pastel Candy Cane"], "beginner", 40, false],
  ["Favia", ["Dragon Soul Favia", "Reverse Prism Favia"], "intermediate", 60, true],
  ["Chalice", ["Miami Sunrise Chalice", "Blueberry Chalice"], "expert", 110, true],
  ["Goniopora", ["Red Goni", "Rainbow Goni"], "intermediate", 70, true],
];

export const CATALOG: CatalogItem[] = LINES.flatMap(([genus, names, careLevel, base, auctionable], li) =>
  names.map((name, ni) => ({
    sku: `RC-${String(li + 1).padStart(2, "0")}${String(ni + 1).padStart(2, "0")}`,
    name,
    genus,
    careLevel,
    basePriceUsd: Math.round(base * (0.8 + 0.4 * ((ni * 7 + li * 3) % 10) / 10)),
    auctionable,
  }))
);

export const DESTINATIONS = [
  "Denver, CO", "Austin, TX", "Seattle, WA", "Miami, FL", "Chicago, IL",
  "Phoenix, AZ", "Boston, MA", "Minneapolis, MN", "Atlanta, GA", "Portland, OR",
  "Brooklyn, NY", "San Diego, CA", "Nashville, TN", "Columbus, OH", "Tampa, FL",
];

/** Synthetic display names only. */
export const CUSTOMER_NAMES = [
  "reefbuilder42", "coral_km", "tank_theresa", "spslover", "fragswapfan",
  "nano_nate", "zoagarden", "acro_addict", "lps_lucy", "saltysam",
  "wetthumb", "polypdan", "reefmomma", "torchcollector", "bluethumb88",
];
