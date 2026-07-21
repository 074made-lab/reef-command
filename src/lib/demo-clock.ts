/**
 * A stable, synthetic clock for the hackathon story.
 *
 * The cockpit must not change phase because a judge happens to open it on a
 * different weekday. The owner chooses "today" from the header and that day
 * remains authoritative across every component and chat turn.
 */
import type {
  ComponentSpec,
  DayPriority,
  DemoDayId,
  WeekPhase,
} from "./protocol";

export type DemoDay = {
  id: DemoDayId;
  phase: WeekPhase;
  short: string;
  weekday: string;
  time: string;
  label: string;
  goal: string;
  priorities: DayPriority[];
  reminder: string;
};

export const DEMO_DAYS: DemoDay[] = [
  {
    id: "monday", phase: "label_day", short: "MON", weekday: "Monday", time: "18:10", label: "Label Day",
    goal: "Lock the combined shipment plan, then buy the right labels once — with a human checkpoint.",
    priorities: [
      { label: "Clear exceptions before spend", detail: "Resolve holds, address changes, late add-ons, and ambiguous customer matches before labels are purchased.", cue: "do-now", prompt: "What needs my attention?" },
      { label: "Collapse every eligible order", detail: "Confirm ReefnBid, Shopify, and eBay orders are flowing into one customer box and one shipping fee.", cue: "do-now", prompt: "Any orders to merge?" },
      { label: "Build and approve the batch", detail: "Calculate weights, weather packs, product labels, and shipping labels; carrier spend waits for the owner click.", cue: "human-gate", prompt: "Run label day" },
    ],
    reminder: "Do not approve the label batch until merge and address exceptions are clear.",
  },
  {
    id: "tuesday", phase: "ship_days", short: "TUE", weekday: "Tuesday", time: "09:30", label: "Ship + Preview",
    goal: "Move the first live-coral boxes safely while opening the next ReefnBid story.",
    priorities: [
      { label: "Ship the ready combined boxes", detail: "Verify product labels, shipping labels, weather packs, and the Tuesday handoff queue.", cue: "do-now" },
      { label: "Catch last-minute exceptions", detail: "Handle address, hold, or cancellation requests before a box leaves; replacement label spend remains human-gated.", cue: "watch", prompt: "What needs my attention?" },
      { label: "Start the next auction preview", detail: "Segment previews by dossier tier, coral preference, and home platform while shipping continues.", cue: "do-now" },
    ],
    reminder: "Shipping the old cycle and previewing the new auction happen in parallel today.",
  },
  {
    id: "wednesday", phase: "report", short: "WED", weekday: "Wednesday", time: "18:15", label: "Ship + Report",
    goal: "Close the shipping cycle, learn from it, and turn the evidence into next week's stock plan.",
    priorities: [
      { label: "Finish the final ship queue", detail: "Clear the remaining eligible boxes and isolate anything that must hold to next week.", cue: "do-now", prompt: "What needs my attention?" },
      { label: "Close the reef-health report", detail: "Review platform mix, dossier tiers, product economics, return rate, and the ReefnBid-to-add-on funnel.", cue: "do-now", prompt: "Weekly report" },
      { label: "Translate insight into buying", detail: "Protect core categories, lean into demand, and buy laggards shallower for the coming cycle.", cue: "watch" },
    ],
    reminder: "The report is only useful when its category signals change next week's stock depth.",
  },
  {
    id: "thursday", phase: "auction_live", short: "THU", weekday: "Thursday", time: "20:45", label: "Auction Opens",
    goal: "Open ReefnBid with a live view of demand and keep targeted customers engaged.",
    priorities: [
      { label: "Watch the live board", detail: "Track leaders, bid depth, soft lots, and the true close state without inventing urgency.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Send targeted opening nudges", detail: "Use tier, preference, and platform history instead of one generic blast.", cue: "watch" },
      { label: "Triage inbound questions", detail: "Keep buyer questions and operational exceptions from aging while bids stream.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "Use live bid evidence for urgency; never describe a closed board as live.",
  },
  {
    id: "friday", phase: "auction_live", short: "FRI", weekday: "Friday", time: "18:30", label: "Auction Momentum",
    goal: "Strengthen the middle of the auction without spamming the whole customer base.",
    priorities: [
      { label: "Find demand gaps", detail: "Compare leading lots with soft categories and decide which customers should see which coral.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Nudge the right audience", detail: "Target messages by coral preference and dossier tier; keep every simulated send in the event history.", cue: "watch" },
      { label: "Protect response time", detail: "Answer buyer questions before the Saturday close creates a larger queue.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "Friday is for precise nudges, not a louder version of Thursday.",
  },
  {
    id: "saturday", phase: "winners", short: "SAT", weekday: "Saturday", time: "22:47", label: "Close + Winners",
    goal: "Close ReefnBid truthfully, then turn winners into a clear two-day add-on journey.",
    priorities: [
      { label: "Confirm the final board", detail: "Use the closed state and final hammer prices; never call the auction live after the close.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Guide every winner", detail: "Send payment instructions, cross-platform discount codes, add-on steps, and the shipping schedule.", cue: "do-now" },
      { label: "Open the add-on watch", detail: "Prepare identity matching and order monitoring across Shopify and eBay for the Sunday wave.", cue: "watch" },
    ],
    reminder: "A winner notification should explain payment, add-ons, and shipping in one calm path.",
  },
  {
    id: "sunday", phase: "addon_window", short: "SUN", weekday: "Sunday", time: "14:20", label: "Add-on Day",
    goal: "Help winners add higher-margin coral while keeping one customer, one box, and one shipping fee.",
    priorities: [
      { label: "Watch every incoming order", detail: "Separate organic Shopify/eBay sales from winner add-ons without losing either stream.", cue: "watch", prompt: "How's business?" },
      { label: "Merge across platforms", detail: "Match identities carefully and combine only unambiguous ReefnBid, Shopify, and eBay orders.", cue: "do-now", prompt: "Any orders to merge?" },
      { label: "Protect Monday readiness", detail: "Surface holds, address changes, and late-add-on questions before Label Day locks the batch.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "The customer value is one shipping fee; the business value is a stronger add-on basket.",
  },
];

export const DEFAULT_DEMO_DAY: DemoDayId = "monday";
export const DEMO_DAY_EVENT = "reef:demo-day";
export const DEMO_CHAT_PROMPT_EVENT = "reef:chat-prompt";

/**
 * Stable ClickHouse cycle used by the selectable recording week. W28 has the
 * complete deterministic auction arc in the seeded world: THU open through
 * SAT close, followed by SUN-WED operations. Keeping this explicit prevents a
 * judge's wall clock from silently swapping the demo to a different cycle.
 */
export const DEMO_AUCTION_WEEK_INDEX = 28;

const DEMO_WEEK_ANCHOR = Date.UTC(2026, 0, 1);
const WEEK_MS = 7 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const CYCLE_DAY: Record<DemoDayId, number> = {
  thursday: 0,
  friday: 1,
  saturday: 2,
  sunday: 3,
  monday: 4,
  tuesday: 5,
  wednesday: 6,
};

/** Synthetic timestamp for a selected day inside the stable demo cycle. */
export function demoAuctionMoment(dayId: DemoDayId): number {
  const day = demoDay(dayId);
  const [hour, minute] = day.time.split(":").map(Number);
  return DEMO_WEEK_ANCHOR + DEMO_AUCTION_WEEK_INDEX * WEEK_MS +
    CYCLE_DAY[dayId] * DAY_MS + hour * 60 * 60_000 + minute * 60_000;
}

export function demoDay(dayId: DemoDayId): DemoDay {
  return DEMO_DAYS.find((day) => day.id === dayId) ?? DEMO_DAYS[0];
}

export function dayBriefSpec(dayId: DemoDayId): ComponentSpec[] {
  const day = demoDay(dayId);
  return [{
    kind: "day_brief",
    dayId: day.id,
    weekday: day.weekday,
    time: day.time,
    label: day.label,
    goal: day.goal,
    priorities: day.priorities,
    reminder: day.reminder,
  }];
}

export function withDemoDayContext(dayId: DemoDayId, message: string): string {
  const day = demoDay(dayId);
  return `[SYNTHETIC DEMO TODAY: ${day.id.toUpperCase()} — ${day.label.toUpperCase()}]\n${message}`;
}

export function stripDemoDayContext(message: string): string {
  return message.replace(/^\[SYNTHETIC DEMO TODAY:[^\]]+\]\s*/i, "");
}

export function parseDemoDayContext(message: string): DemoDayId | undefined {
  const match = message.match(/^\[SYNTHETIC DEMO TODAY:\s*(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/i);
  return match?.[1].toLowerCase() as DemoDayId | undefined;
}
