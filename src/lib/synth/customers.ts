/**
 * Deterministic synthetic customer pool (~420 customers).
 *
 * Built to exercise the customer-360 matcher (Task 1):
 *  - ~35% hold accounts on 2+ platforms (merge fodder for Task 3.1)
 *  - of those, most reuse the same email (exact match), some use a different
 *    email but the same phone (tier-2 match), a few share only a name
 *    (low-confidence match → gated merge card)
 *  - spendFactor is lognormal-ish; tiers are percentile cuts over it
 *    (top 5% = T1, to 20% = T2, to 50% = T3, rest = T4 — first-timers land T4)
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
  spendFactor: number;                   // relative order-size/frequency multiplier
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

export const POOL_SIZE = 420;

function buildPool(seed: number): SynthCustomer[] {
  const rng = mulberry32(seed);
  const raw: Omit<SynthCustomer, "tier">[] = [];

  for (let i = 1; i <= POOL_SIZE; i++) {
    const handle = `${ADJ[Math.floor(rng() * ADJ.length)]}_${NOUN[Math.floor(rng() * NOUN.length)]}${Math.floor(rng() * 990)}`;
    const email = `${handle}@${DOMAINS[Math.floor(rng() * DOMAINS.length)]}`;
    const phone = rng() < 0.7 ? `+1555${String(1000000 + Math.floor(rng() * 8999999))}` : undefined;

    // lognormal-ish spend propensity (Box–Muller)
    const n = Math.sqrt(-2 * Math.log(rng() || 1e-9)) * Math.cos(2 * Math.PI * rng());
    const spendFactor = Math.exp(0.6 * n);

    const primary: Platform = rng() < 0.45 ? "web" : rng() < 0.55 ? "auction" : "marketplace";
    const platforms: SynthCustomer["platforms"] = [
      { platform: primary, handle, email, phone },
    ];

    if (rng() < 0.35) {                  // second platform account
      const second: Platform = primary === "auction" ? (rng() < 0.6 ? "web" : "marketplace")
        : primary === "web" ? (rng() < 0.5 ? "auction" : "marketplace")
        : (rng() < 0.5 ? "auction" : "web");
      const style = rng();
      if (style < 0.7) {
        platforms.push({ platform: second, handle: `${handle}_${second[0]}`, email, phone });          // exact-email match
      } else if (style < 0.9 && phone) {
        platforms.push({ platform: second, handle: `${handle}${Math.floor(rng() * 99)}`, email: `${handle}.alt@${DOMAINS[Math.floor(rng() * DOMAINS.length)]}`, phone });  // phone match
      } else {
        platforms.push({ platform: second, handle: `${handle}x`, email: `${handle}.other@${DOMAINS[Math.floor(rng() * DOMAINS.length)]}` });  // name-only → low confidence
      }
    }

    raw.push({
      id: i, displayName: handle, email, phone, spendFactor, platforms,
      auctionActive: platforms.some((p) => p.platform === "auction") && rng() < 0.75,
      prefCategories: [CATS[Math.floor(rng() * CATS.length)], ...(rng() < 0.4 ? [CATS[Math.floor(rng() * CATS.length)]] : [])],
      contact: rng() < 0.5 ? "email" : rng() < 0.7 ? "both" : "sms",
    });
  }

  // percentile tier cuts over spendFactor: 5% / 20% / 50% (mirrors real practice)
  const sorted = [...raw].sort((a, b) => b.spendFactor - a.spendFactor);
  const tierOf = new Map<number, 1 | 2 | 3 | 4>();
  sorted.forEach((c, idx) => {
    const pct = idx / sorted.length;
    tierOf.set(c.id, pct < 0.05 ? 1 : pct < 0.20 ? 2 : pct < 0.50 ? 3 : 4);
  });
  return raw.map((c) => ({ ...c, tier: tierOf.get(c.id)! }));
}

export const CUSTOMERS: SynthCustomer[] = buildPool(7);

export const AUCTION_CUSTOMERS = CUSTOMERS.filter((c) => c.auctionActive);
