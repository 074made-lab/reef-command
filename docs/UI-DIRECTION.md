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

- Keep the deep-ocean blue base.
- Primary accents: **coral orange (`#FF8559`, tint `#FFB89E`)**,
  **bioluminescent teal/cyan**.
- Secondary: a little **beach off-white / sand**.
- **No generic AI purple.** No purple-gradient-on-dark.

## Components read as a reef, not a BI suite

- **Auction Board** → bid tags hanging on a coral rack.
- **Merge Card** → two frags flowing into one shipping box (the signature shot).
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
  equivalent), and keeps all seven weekdays visible for recording.
- Selecting any weekday sends its synthetic-day context into `chat.agent()`.
  Teddy must render the day's goal, three priorities, one reminder, and prompt
  chips for supported live components. Selection does not execute the work.
- The empty cockpit shows only three compact priority bullets. Day briefs keep
  the same evidence but reveal explanations progressively so the default view
  remains scannable on a recording and during store operations.
- Platform labels use the business names everywhere: **ReefnBid**, **Online
  Store (Shopify)**, and **eBay**.
- Merge cards use layered water currents and moving particles to carry every
  source order into one combined shipping box.
- The weekly reef-health report is tabbed. Platform revenue appears as three
  currents feeding one reef; product and auction rows generate deterministic,
  evidence-backed next-week stocking guidance. Dossier tiers include their
  synthetic percentile definition and do not masquerade as new-customer rate.
- Attention rows expand in place. DOA cases reveal the original synthetic text
  and a clearly marked mock photo; messages reveal an editable template draft.
  Approve and Send remain explicit simulations: no refund or external message.

## Type

- Don't set everything in the usual Inter. Headings can be a touch warmer, with
  an editorial feel; numbers stay in a clear mono.
- **Bump the smallest labels: current 10–11px loses legibility after video
  compression — raise the floor to at least 12px.**

## The video

The star of the video is the **visual result**, not the chat box. The
**Merge Card** is the signature shot: two platform orders swim into one box,
Teddy beside it confirming "one box, one shipping fee."

The demo sequence is a guided week, after the human introduction and business
context: select **MON** for the label-day gate, **TUE/WED** for shipping and the
report, **THU–SAT** for the auction arc, then **SUN** for add-ons and the merge
shot. Each click begins with Teddy's day-aware command brief before opening the
supporting live component.
