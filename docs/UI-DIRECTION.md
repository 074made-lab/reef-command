# Reef Command — UI direction

> Owner design call (2026-07-20). One-line positioning:
> **Reef Command — TIA's living coral cockpit, watched over by Teddy.**
>
> This is presentation guidance for the `/merchant` cockpit and the video. It
> refines the visual language already shipped (deep-ocean console); it does not
> change the component protocol or the data. Serious errors always stay in
> formal language — the friendly layer must never lower trust.

## The feeling

Two things held together: **TIA's deep-sea coral control room** + **Teddy's
light, companionable presence**. The first screen should not read as a BI
dashboard; it should read as *a TIA Reef Room that is currently running* —
current cycle, Teddy's state, the single most important thing, then five
question entry points.

## Palette

- Keep the deep-ocean blue base and warm off-white text.
- Use **coral orange (`#FF8559`, tint `#FFC1AA`)** for brand, selected state,
  alerts, and primary action.
- Reserve restrained blue-green for data and status. It is supporting contrast,
  not a second competing brand color.
- **No generic AI purple.** No purple-gradient-on-dark.

## Product-first composition

- Public TIA Coral photography carries the first impression and the weekly
  auction summary. Captions stay short and all report values remain synthetic.
- The selected day and one task list lead the home state. Product imagery gets
  more area than explanatory copy, following the portfolio-first rhythm seen
  in SCAD's graphic-design work pages.
- Remove terminal ornament, neon glow, and decorative diagrams when a coral
  image or one number communicates the point faster.

## Components read as a reef, not a BI suite

- **Auction Board** → bid tags hanging on a coral rack.
- **Merge Card** → two frags flowing into one shipping box.
- **Weekly Report** → a *reef health report*.
- **Attention Feed** → the anomalies that need to surface for handling.

## Teddy — the small co-pilot (not a chat avatar hogging the frame)

Teddy has moods, shown small and peripheral, never center stage:

| State | Teddy |
|---|---|
| Empty / idle | lying down, waiting for a question |
| Reading data | little dive mask on, observing |
| Task done | carrying a shipping label, or holding a small flag |
| Risk / attention | ears up, alert |

Teddy's copy is short, e.g.:
- "Teddy spotted 3 things."
- "Reef looks calm."
- "Two orders, one box."

**Serious errors keep formal language** — do not let the cute layer reduce
credibility.

## Motion

Very light only: water ripple, bubbles, a coral bioluminescent "breathing"
glow. **No** AI orb, **no** typewriter long-text, **no** meaningless loading
spinners.

- After a question, follow the working state and then place the start of
  Teddy's newest answer above the fold. User scroll intent pauses following;
  a compact jump control restores it.
- Keep routine feedback within roughly 100–300ms. The Merge Card may use one
  short coordinated entrance to explain many orders becoming one box.
- Never hide content behind motion. Respect `prefers-reduced-motion`, including
  SVG particles.

## Interaction details

- The header is a **selectable seven-day synthetic week**, never the evaluator's
  wall clock. It always states `TODAY IS MONDAY · LABEL DAY` (or the selected
  equivalent), and keeps all seven weekdays visible for quick operation.
- Selecting any weekday sends its synthetic-day context into `chat.agent()`.
  Teddy must render the day's goal, three priorities, one reminder, and prompt
  chips for supported live components. Selection does not execute the work.
- The empty cockpit shows only three compact priority bullets. Day briefs keep
  the same evidence but reveal explanations progressively so the default view
  remains scannable during store operations.
- Platform labels use the business names everywhere: **ReefnBid**, **Online
  Store (Shopify)**, and **eBay**.
- Merge cards use layered water currents and moving particles to carry every
  source order into one combined shipping box.
- The weekly reef-health report is tabbed. The default view is aggregate and
  the auction view leads with three product images before offering the full
  table. The public demo contains no production stocking, customer-value,
  profitability, identity-resolution, or targeting method.
- Attention rows expand in place. DOA cases reveal the original synthetic text
  and a clearly marked mock photo; messages reveal an editable template draft.
  Approve and Send remain explicit simulations: no refund or external message.

## Type

- Don't set everything in the usual Inter. Headings can be a touch warmer, with
  an editorial feel; numbers stay in a clear mono.
- **Keep the smallest labels at least 12px so secondary information remains
  legible on compact screens.**
