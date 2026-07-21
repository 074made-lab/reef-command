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
    goal: "Prepare this week's orders for shipping: fix issues, combine boxes, and prepare one label batch.",
    priorities: [
      { label: "Clear order issues", detail: "Review holds, address changes, cancellations, and late add-ons before any label purchase.", cue: "do-now", prompt: "Show me urgent customer messages, holds, address changes, and order exceptions to clear before label approval. Do not prepare the label manifest yet." },
      { label: "Combine matching orders", detail: "Put the same customer's eligible orders from different sales channels into one shipment.", cue: "do-now", prompt: "Check for orders we can combine across platforms." },
      { label: "Prepare labels in bulk", detail: "Check weight and weather protection, then send one label batch to the owner for approval.", cue: "human-gate", prompt: "Run label day: prepare today's shipping-label batch for bulk approval." },
    ],
    reminder: "Tell winners the ship date, add-on code, and that eligible orders will share one box.",
  },
  {
    id: "tuesday", phase: "ship_days", short: "TUE", weekday: "Tuesday", time: "09:30", label: "Ship + Preview",
    goal: "Ship today's prepared orders and stop last-minute changes before carrier handoff.",
    priorities: [
      { label: "Check today's boxes", detail: "Confirm packing lists, labels, and weather protection before handoff.", cue: "do-now", prompt: "What needs my attention?" },
      { label: "Stop urgent changes", detail: "Catch hold, address, or cancel requests before the carrier takes the box.", cue: "watch", prompt: "What needs my attention?" },
      { label: "Check the store pulse", detail: "Keep the next auction cycle visible while today's boxes leave.", cue: "do-now", prompt: "How's business?" },
    ],
    reminder: "A late customer change must reach packing before the carrier receives the box.",
  },
  {
    id: "wednesday", phase: "report", short: "WED", weekday: "Wednesday", time: "18:15", label: "Ship + Report",
    goal: "Finish this week's shipping and review results before the next auction.",
    priorities: [
      { label: "Finish today's shipments", detail: "Ship the remaining ready boxes and hold anything that cannot leave safely.", cue: "do-now", prompt: "What needs my attention?" },
      { label: "Review the weekly report", detail: "Check channel results, repeat buyers, product movement, and the add-on funnel.", cue: "do-now", prompt: "Weekly report" },
      { label: "Set next week's priorities", detail: "Turn the weekly results into a short list of follow-up work.", cue: "watch", prompt: "Weekly report" },
    ],
    reminder: "Use the report to decide what needs attention next week.",
  },
  {
    id: "thursday", phase: "auction_live", short: "THU", weekday: "Thursday", time: "20:45", label: "Auction Opens",
    goal: "Open the weekly auction and watch bids and buyer questions in real time.",
    priorities: [
      { label: "Check the live auction", detail: "See leaders, bid activity, and lots that need attention.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Verify the opening status", detail: "Make sure the customer view and internal board agree on auction timing.", cue: "watch", prompt: "How's the auction going?" },
      { label: "Answer buyer questions", detail: "Clear buyer questions and order issues while bidding is active.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "The board must always show the real auction state: open or closed.",
  },
  {
    id: "friday", phase: "auction_live", short: "FRI", weekday: "Friday", time: "18:30", label: "Auction Momentum",
    goal: "Keep the auction accurate and clear buyer questions before Saturday's close.",
    priorities: [
      { label: "Check bid movement", detail: "Compare current bidding with Thursday's opening.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Keep the board accurate", detail: "Make sure every lot and close time still shows the correct state.", cue: "watch", prompt: "How's the auction going?" },
      { label: "Clear buyer questions", detail: "Answer questions before the final-night rush.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "Answer questions today so closing night does not create a bigger queue.",
  },
  {
    id: "saturday", phase: "winners", short: "SAT", weekday: "Saturday", time: "22:47", label: "Close + Winners",
    goal: "Close the auction, confirm winners, and start the two-day add-on window.",
    priorities: [
      { label: "Confirm final results", detail: "Lock the closed state and show final hammer prices.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Send winner next steps", detail: "Give winners payment, add-on, and shipping instructions.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Watch add-on orders", detail: "Watch for new orders that may belong in the same shipment.", cue: "watch", prompt: "Any orders to merge?" },
    ],
    reminder: "Every winner needs payment steps, an add-on code, and a ship date.",
  },
  {
    id: "sunday", phase: "addon_window", short: "SUN", weekday: "Sunday", time: "14:20", label: "Add-on Day",
    goal: "Combine add-on orders so each customer has one clear shipment for Monday.",
    priorities: [
      { label: "Watch new orders", detail: "Keep orders from the auction, online store, and marketplace visible together.", cue: "watch", prompt: "How's business?" },
      { label: "Combine matching orders", detail: "Put each customer's eligible orders into one coordinated shipment.", cue: "do-now", prompt: "Any orders to merge?" },
      { label: "Clear Monday blockers", detail: "Catch holds, address changes, and late add-ons before label work begins.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "Resolve holds, address changes, and late add-ons before Monday label work.",
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
 * Stable ClickHouse cycle used by the selectable synthetic week. W28 has the
 * complete deterministic auction arc in the seeded world: THU open through
 * SAT close, followed by SUN-WED operations. Keeping this explicit prevents a
 * wall clock from silently swapping the interface to a different cycle.
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
