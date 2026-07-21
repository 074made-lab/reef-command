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
    goal: "Monday is shipping prep: review every open order, combine eligible purchases, then prepare one label batch for owner approval.",
    priorities: [
      { label: "Validate orders before labels", detail: "Review holds, address changes, late add-ons, and other exceptions before any shipping-label purchase.", cue: "do-now", prompt: "Show me urgent customer messages, holds, address changes, and order exceptions to clear before label approval. Do not prepare the label manifest yet." },
      { label: "Find orders to combine", detail: "Check eligible synthetic orders across sales platforms so one customer receives one box and one shipping fee.", cue: "do-now", prompt: "Check for orders we can combine across platforms." },
      { label: "Prepare the label batch", detail: "Calculate shipment weights and weather packs, then prepare shipping labels for one owner-approved bulk purchase.", cue: "human-gate", prompt: "Run label day: prepare today's shipping-label batch for bulk approval." },
    ],
    reminder: "Winner notifications show the exact ship date, include an add-on discount code, and explain that eligible purchases combine into one box.",
  },
  {
    id: "tuesday", phase: "ship_days", short: "TUE", weekday: "Tuesday", time: "09:30", label: "Ship + Preview",
    goal: "Move prepared boxes safely while catching customer changes before carrier handoff.",
    priorities: [
      { label: "Ship the ready combined boxes", detail: "Verify product labels, shipping labels, weather packs, and the Tuesday handoff queue.", cue: "do-now", prompt: "What needs my attention?" },
      { label: "Catch last-minute exceptions", detail: "Handle address, hold, or cancellation requests before a box leaves; replacement label spend remains human-gated.", cue: "watch", prompt: "What needs my attention?" },
      { label: "Keep the next cycle moving", detail: "Monitor the next synthetic sales cycle without exposing any production targeting or campaign rules.", cue: "do-now", prompt: "How's business?" },
    ],
    reminder: "Shipping the old cycle and previewing the new auction happen in parallel today.",
  },
  {
    id: "wednesday", phase: "report", short: "WED", weekday: "Wednesday", time: "18:15", label: "Ship + Report",
    goal: "Close the shipping cycle and turn synthetic history into a clear operational review.",
    priorities: [
      { label: "Finish the final ship queue", detail: "Clear the remaining eligible boxes and isolate anything that must hold to next week.", cue: "do-now", prompt: "What needs my attention?" },
      { label: "Close the reef-health report", detail: "Review synthetic platform mix, customer continuity, category movement, and the cross-channel funnel.", cue: "do-now", prompt: "Weekly report" },
      { label: "Record the operational signal", detail: "Keep the evidence visible without publishing a production buying, margin, or customer-value model.", cue: "watch", prompt: "Weekly report" },
    ],
    reminder: "The public report demonstrates analytical depth; production decisions remain outside this repository.",
  },
  {
    id: "thursday", phase: "auction_live", short: "THU", weekday: "Thursday", time: "20:45", label: "Auction Opens",
    goal: "Open the synthetic auction with a truthful live view of demand and incoming questions.",
    priorities: [
      { label: "Watch the live board", detail: "Track leaders, bid depth, soft lots, and the true close state without inventing urgency.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Confirm the opening state", detail: "Keep the board and customer-facing timing consistent with the real event state.", cue: "watch", prompt: "How's the auction going?" },
      { label: "Triage inbound questions", detail: "Keep buyer questions and operational exceptions from aging while bids stream.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "Use live bid evidence for urgency; never describe a closed board as live.",
  },
  {
    id: "friday", phase: "auction_live", short: "FRI", weekday: "Friday", time: "18:30", label: "Auction Momentum",
    goal: "Watch the auction's middle without inventing urgency or publishing targeting logic.",
    priorities: [
      { label: "Read the live movement", detail: "Compare current bids with the opening state using only synthetic event history.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Keep outreach bounded", detail: "The public demo records simulated sends but contains no production timing or audience-selection method.", cue: "watch", prompt: "How's the auction going?" },
      { label: "Protect response time", detail: "Answer buyer questions before the Saturday close creates a larger queue.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "Friday is for precise nudges, not a louder version of Thursday.",
  },
  {
    id: "saturday", phase: "winners", short: "SAT", weekday: "Saturday", time: "22:47", label: "Close + Winners",
    goal: "Close ReefnBid truthfully, then turn winners into a clear two-day add-on journey.",
    priorities: [
      { label: "Confirm the final board", detail: "Use the closed state and final hammer prices; never call the auction live after the close.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Guide every winner", detail: "Send payment instructions, cross-platform discount codes, add-on steps, and the shipping schedule.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Open the order watch", detail: "Monitor pre-linked synthetic customer references for new cross-channel orders.", cue: "watch", prompt: "Any orders to merge?" },
    ],
    reminder: "A winner notification should explain payment, add-ons, and shipping in one calm path.",
  },
  {
    id: "sunday", phase: "addon_window", short: "SUN", weekday: "Sunday", time: "14:20", label: "Add-on Day",
    goal: "Keep eligible synthetic orders together so one customer receives one coordinated shipment.",
    priorities: [
      { label: "Watch every incoming order", detail: "Keep independent synthetic order streams visible without publishing production attribution rules.", cue: "watch", prompt: "How's business?" },
      { label: "Merge across platforms", detail: "Combine only pre-linked synthetic references that are unambiguous in the demo dataset.", cue: "do-now", prompt: "Any orders to merge?" },
      { label: "Protect Monday readiness", detail: "Surface holds, address changes, and late-add-on questions before Label Day locks the batch.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "The public value is fewer duplicate shipments and a clearer customer handoff; no margin model is included.",
  },
];

export const DEFAULT_DEMO_DAY: DemoDayId = "monday";
export const DEMO_DAY_EVENT = "reef:demo-day";
export const DEMO_CHAT_PROMPT_EVENT = "reef:chat-prompt";
export const DEMO_DAY_STORAGE_KEY = "reef-command:demo-day";

export type DemoChatPromptDetail = {
  prompt: string;
  dayId: DemoDayId;
  priorityIndex: number;
};

export function isDemoDayId(value: string | null): value is DemoDayId {
  return DEMO_DAYS.some((day) => day.id === value);
}

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
  return message
    .replace(/^\[SYNTHETIC DEMO TODAY:[^\]]+\]\s*/i, "")
    .replace(/^\[SYNTHETIC SHIP TRACE:[^\]]+\]\s*/i, "");
}

export function parseDemoDayContext(message: string): DemoDayId | undefined {
  const match = message.match(/^\[SYNTHETIC DEMO TODAY:\s*(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/i);
  return match?.[1].toLowerCase() as DemoDayId | undefined;
}
