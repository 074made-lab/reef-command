/**
 * Deterministic synthetic customer pool (~1,600 customers).
 *
 * Built only to create varied public-demo shapes: some synthetic people have
 * pre-linked accounts on multiple platforms, order frequency varies, and the
 * UI receives four arbitrary demo bands. These generator choices are not TIA
 * Coral's identity, customer-value, profitability, or segmentation method.
 *
 * All identities are invented. Zero real customer data anywhere.
 */

import type { CoralCategory, Platform } from "../protocol";
import { mulberry32 } from "./rand";

export type SynthCustomer = {
  id: number;
  displayName: string;
  email: string;
  phone?: string;
  tier: 1 | 2 | 3 | 4;
  joinWeek: number;                      // arbitrary synthetic arrival week
  platforms: { platform: Platform; handle: string; email: string; phone?: string }[];
  auctionActive: boolean;
  prefCategories: CoralCategory[];
  contact: "email" | "sms" | "both";
};

const ADJ = ["reef", "salty", "coral", "frag", "polyp", "tide", "nano", "blue", "torch", "zoa",
  "acro", "wet", "glow", "drift", "kelp", "lagoon", "briny", "pearl", "manta", "moray"];
const NOUN = ["builder", "keeper", "hunter", "farmer", "fan", "guy", "gal", "dan", "kim", "lee",
  "smith", "wong", "lucy", "sam", "max", "ray", "nate", "tess", "cole", "ivy"];
const DOMAINS = ["example.com", "example.net", "example.org", "mail.example", "inbox.example"];
const CATS: CoralCategory[] = ["zoas", "euphyllia", "goni", "mushroom", "sps", "other"];

export const POOL_SIZE = 1600;

function buildPool(seed: number): SynthCustomer[] {
  const rng = mulberry32(seed);
  const raw: Omit<SynthCustomer, "tier">[] = [];

  for (let i = 1; i <= POOL_SIZE; i++) {
    const handle = `${ADJ[Math.floor(rng() * ADJ.length)]}_${NOUN[Math.floor(rng() * NOUN.length)]}${Math.floor(rng() * 990)}`;
    const email = `${handle}@${DOMAINS[Math.floor(rng() * DOMAINS.length)]}`;
    const phone = rng() < 0.7 ? `+1555${String(1000000 + Math.floor(rng() * 8999999))}` : undefined;

    const primary: Platform = rng() < 0.45 ? "web" : rng() < 0.55 ? "auction" : "marketplace";
    const platforms: SynthCustomer["platforms"] = [
      { platform: primary, handle, email, phone },
    ];

    if (rng() < 0.35) {                  // pre-linked second demo account
      const second: Platform = primary === "auction" ? (rng() < 0.6 ? "web" : "marketplace")
        : primary === "web" ? (rng() < 0.5 ? "auction" : "marketplace")
        : (rng() < 0.5 ? "auction" : "web");
      // `customer_id` is the fixture link. The public generator intentionally
      // does not encode an identity-resolution hierarchy or confidence rule.
      platforms.push({
        platform: second,
        handle: `${handle}_${second[0]}${Math.floor(rng() * 99)}`,
        email: `${handle}.linked${i}@${DOMAINS[Math.floor(rng() * DOMAINS.length)]}`,
      });
    }

    raw.push({
      id: i, displayName: handle, email, phone,
      joinWeek: Math.floor(rng() * 38) - 8,      // steady acquisition, weeks -8 … 29
      platforms,
      auctionActive: platforms.some((p) => p.platform === "auction") && rng() < 0.75,
      prefCategories: [CATS[Math.floor(rng() * CATS.length)], ...(rng() < 0.4 ? [CATS[Math.floor(rng() * CATS.length)]] : [])],
      contact: rng() < 0.5 ? "email" : rng() < 0.7 ? "both" : "sms",
    });
  }

  // Arbitrary synthetic display bands. They are deliberately unrelated to
  // spend, orders, return behavior, product mix, or profitability.
  return raw.map((c) => ({ ...c, tier: (1 + ((c.id * 7) % 4)) as 1 | 2 | 3 | 4 }));
}

export const CUSTOMERS: SynthCustomer[] = buildPool(7);

export const AUCTION_CUSTOMERS = CUSTOMERS.filter((c) => c.auctionActive);
