/**
 * A stable, synthetic clock for the hackathon story.
 *
 * The cockpit must not change phase because a judge happens to open it on a
 * different weekday. Components publish a phase beacon as they render and the
 * owner can also choose a moment manually from the header.
 */
import type { WeekPhase } from "./protocol";

export type DemoMoment = {
  phase: WeekPhase;
  day: string;
  time: string;
  label: string;
  note: string;
};

export const DEMO_MOMENTS: DemoMoment[] = [
  { phase: "announce", day: "TUE", time: "10:15", label: "Auction preview", note: "segmented preview sends" },
  { phase: "auction_live", day: "THU", time: "20:45", label: "Auction live", note: "ReefnBid bids streaming" },
  { phase: "winners", day: "SAT", time: "22:47", label: "Winners", note: "codes + payment follow-up" },
  { phase: "addon_window", day: "SUN", time: "14:20", label: "Add-on window", note: "cross-platform orders combine" },
  { phase: "label_day", day: "MON", time: "18:10", label: "Label day", note: "weather + gated label batch" },
  { phase: "ship_days", day: "TUE", time: "09:30", label: "Ship days", note: "combined boxes leave Tue–Wed" },
  { phase: "report", day: "WED", time: "18:15", label: "Weekly report", note: "stock next week's reef" },
];

export const DEFAULT_DEMO_PHASE: WeekPhase = "addon_window";
export const DEMO_PHASE_EVENT = "reef:demo-phase";

export function demoMoment(phase: WeekPhase): DemoMoment {
  return DEMO_MOMENTS.find((m) => m.phase === phase) ?? DEMO_MOMENTS[0];
}
