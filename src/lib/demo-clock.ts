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
    id: "sunday", phase: "addon_window", short: "SUN", weekday: "Sunday", time: "14:20", label: "Add-ons + Announcement",
    goal: "Combine eligible add-ons and review the next-auction announcement before Monday's document work.",
    priorities: [
      { label: "Watch add-on orders", time: "14:20", detail: "Match each Shopify or eBay add-on to its ReefnBid auction anchor and show the resulting box count.", cue: "watch", prompt: "Show only the Sunday add-on orders board with each Shopify or eBay add-on matched to its ReefnBid anchor, plus add-on corals, combined box corals, and value. Do not open merge controls yet." },
      { label: "Combine eligible orders", time: "16:00", detail: "Review every ReefnBid-anchored shipment and merge all eligible add-ons in one click.", cue: "do-now", prompt: "Show every eligible ReefnBid-anchored shipment, reconcile source orders and coral totals, and give me the Merge all control." },
      { label: "Announce next auction", time: "18:30", detail: "Review Thursday–Saturday dates, email and SMS drafts, counts, and the demo send approval.", cue: "human-gate", prompt: "Build Sunday's next-auction announcement for next Thursday through Saturday, closing Saturday at 8 PM ET. Show email and SMS recipient counts, both drafts, and the human-gated demo send button." },
    ],
    reminder: "The announcement remains a draft until approval; Monday starts shipping-document preparation.",
  },
  {
    id: "monday", phase: "label_day", short: "MON", weekday: "Monday", time: "18:10", label: "Shipping Documents",
    goal: "Clear shipment issues, combine eligible orders, and prepare shipping documents for carrier review.",
    priorities: [
      { label: "Clear shipping blockers", time: "08:30", detail: "Review hold requests, replacement items, and customer questions before documents are prepared.", cue: "do-now", prompt: "Open Monday's compact shipping blocker board for approval. Keep the issue summary collapsed." },
      { label: "Combine eligible orders", time: "11:00", detail: "Recheck ReefnBid anchors and combine eligible Shopify or eBay add-ons into one shipment.", cue: "do-now", prompt: "Run Monday's eligible-order check using the same ReefnBid-anchor rule and show the reconciled Merge all board." },
      { label: "Prepare shipping docs", time: "16:30", detail: "Prepare print-ready packing slips, FedEx previews, coral bag labels, weather packs, and box sizes.", cue: "human-gate", prompt: "Prepare Monday's print-ready shipping document board with packing slips, FedEx label previews, one product label per coral bag, weather pack checks, box sizes, and miniature examples. Do not purchase carrier labels." },
    ],
    reminder: "Human staff verify each packed box; the owner approves any shipping-label purchase.",
  },
  {
    id: "tuesday", phase: "ship_days", short: "TUE", weekday: "Tuesday", time: "09:30", label: "Ship + Listings",
    goal: "Ship ready boxes, stage Thursday's ReefnBid listings, and prepare new Shopify arrivals.",
    priorities: [
      { label: "Check today's shipments", time: "09:30", detail: "Confirm packing lists, labels, and weather protection before carrier handoff.", cue: "do-now", prompt: "What shipping exceptions need my attention before today's carrier handoff?" },
      { label: "Stage Thursday listings", time: "13:00", detail: "Prepare ReefnBid lots and new Shopify arrivals for the Thursday publish target.", cue: "do-now", prompt: "Show the Tuesday listing plan for Thursday's ReefnBid lots and new Shopify arrivals." },
      { label: "Request inventory check", time: "16:00", detail: "Ask human staff to verify stock and update Shopify before anything publishes.", cue: "human-gate", prompt: "Show the Tuesday listing plan and the human inventory reminder for Shopify." },
    ],
    reminder: "Human staff update inventory in Shopify; eBay mirrors the Shopify catalog in this demo.",
  },
  {
    id: "wednesday", phase: "announce", short: "WED", weekday: "Wednesday", time: "18:15", label: "Ship + Promotion",
    goal: "Finish ready shipments and review Thursday auction and new-arrival reminders before approval.",
    priorities: [
      { label: "Finish ready shipments", time: "09:30", detail: "Ship the remaining ready boxes and hold anything that cannot leave safely.", cue: "do-now", prompt: "What shipping exceptions need my attention before today's carrier handoff?" },
      { label: "Review auction reminder", time: "15:00", detail: "Review the email and SMS drafts announcing Thursday's ReefnBid opening.", cue: "human-gate", prompt: "Review Wednesday's email and SMS auction reminder drafts for Thursday." },
      { label: "Review arrivals promo", time: "18:15", detail: "Review the Shopify new-coral-arrivals promotion alongside the auction reminder.", cue: "human-gate", prompt: "Review Wednesday's Shopify new-arrivals promotion draft." },
    ],
    reminder: "Email and SMS remain drafts until approval; Thursday is the ReefnBid publish target.",
  },
  {
    id: "thursday", phase: "auction_live", short: "THU", weekday: "Thursday", time: "20:45", label: "Auction Opens",
    goal: "Open the weekly auction and watch bids and buyer questions in real time.",
    priorities: [
      { label: "Check the live auction", time: "18:00", detail: "See leaders, bid activity, and lots that need attention.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Verify the opening status", time: "18:10", detail: "Make sure the customer view and internal board agree on auction timing.", cue: "watch", prompt: "How's the auction going?" },
      { label: "Answer buyer questions", time: "20:45", detail: "Clear buyer questions and order issues while bidding is active.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "The board must always show the real auction state: open or closed.",
  },
  {
    id: "friday", phase: "auction_live", short: "FRI", weekday: "Friday", time: "18:30", label: "Auction Momentum",
    goal: "Keep the auction accurate and clear buyer questions before Saturday's close.",
    priorities: [
      { label: "Check bid movement", time: "12:00", detail: "Compare current bidding with Thursday's opening.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Review last-call ads", time: "17:30", detail: "Review the final-call email and SMS drafts before Saturday's close.", cue: "human-gate", prompt: "Review Friday's auction momentum and last-call advertisement drafts." },
      { label: "Clear buyer questions", time: "18:30", detail: "Answer questions before the final-night rush.", cue: "watch", prompt: "What needs my attention?" },
    ],
    reminder: "Last-call email and SMS remain drafts until approval; keep the live board accurate.",
  },
  {
    id: "saturday", phase: "winners", short: "SAT", weekday: "Saturday", time: "22:47", label: "Closing Night + Winners",
    goal: "Close the auction, confirm winners, and start the two-day add-on window.",
    priorities: [
      { label: "Confirm final results", time: "22:47", detail: "Lock the closed state and show final hammer prices.", cue: "do-now", prompt: "How's the auction going?" },
      { label: "Review winner next steps", time: "22:55", detail: "Check the payment, add-on, and shipping instructions before they go out.", cue: "do-now", prompt: "Review the closed auction board and show the synthetic winner next steps for payment, add-on, and shipping. Do not send or claim a message." },
      { label: "Watch add-on orders", time: "23:05", detail: "Watch for new orders that may belong in the same shipment.", cue: "watch", prompt: "Any orders to merge?" },
    ],
    reminder: "Every winner needs payment steps, an add-on code, and a ship date.",
  },
];

export const DEFAULT_DEMO_DAY: DemoDayId = "sunday";
export const DEMO_DAY_EVENT = "reef:demo-day";
export const DEMO_CHAT_PROMPT_EVENT = "reef:chat-prompt";
export const DEMO_DAY_STORAGE_KEY = "reef-command:demo-day";

export type DemoChatPromptDetail = {
  prompt: string;
  dayId: DemoDayId;
  priorityIndex: number;
};

export function demoPriorityTimestamp(dayId: DemoDayId, priorityIndex: number): string {
  const day = demoDay(dayId);
  const time = day.priorities[priorityIndex]?.time ?? day.time;
  return `${day.short} · ${time} ET`;
}

export function withRoutineContext(dayId: DemoDayId, priorityIndex: number, message: string): string {
  return `[SYNTHETIC ROUTINE: priority=${priorityIndex + 1}; command_time=${demoPriorityTimestamp(dayId, priorityIndex)}; structured_component_required=true]\n${message}`;
}

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
    .replace(/^\[SYNTHETIC ROUTINE:[^\]]+\]\s*/i, "")
    .replace(/^\[SYNTHETIC SHIP TRACE:[^\]]+\]\s*/i, "");
}

export function parseDemoDayContext(message: string): DemoDayId | undefined {
  const match = message.match(/^\[SYNTHETIC DEMO TODAY:\s*(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/i);
  return match?.[1].toLowerCase() as DemoDayId | undefined;
}
