/**
 * The agent brain, portable and orchestration-agnostic.
 *
 * Model id, system prompt, and the typed tool set — the five live-store reads
 * from `lib/tools.ts` wrapped as AI-SDK tools returning ComponentSpec[]. The
 * Trigger.dev `chat.agent()` (`trigger/reef-chat.ts`) imports these; so does
 * the headless `scripts/agent-check.ts` harness. Nothing here depends on
 * Trigger.dev — swapping the orchestrator (or dropping to Claude API direct on
 * the home stack) reuses this file untouched.
 *
 * Token discipline: Sonnet + a small fixed system prompt + compact
 * `toModelOutput` summaries (the model never re-reads full component JSON
 * across turns).
 */
import { tool } from "ai";
import { z } from "zod";
import type { ClickHouseClient } from "@clickhouse/client";
import type { Pool } from "pg";
import { chClient } from "./store/clickhouse";
import { pgPool } from "./store/postgres";
import {
  attentionFeed,
  auctionBoard,
  listingPlan,
  mergeScan,
  promotionPlan,
  revenuePulse,
  winnerNextSteps,
  weeklyReport,
} from "./tools";
import type { ComponentSpec } from "./protocol";
import { dayBriefSpec } from "./demo-clock";

export const MODEL = "claude-sonnet-5";

// Store clients created lazily and memoized (env is read on first tool call,
// not at import — so the headless harness's loadEnvFile runs first, and the
// Trigger worker / Next both work unchanged). Reused across every tool call.
let chSingleton: ClickHouseClient | undefined;
let pgSingleton: Pool | undefined;
const ch = () => (chSingleton ??= chClient());
const pg = () => (pgSingleton ??= pgPool());

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/**
 * Model-facing summary of a rendered answer. The full ComponentSpec[] streams
 * to the frontend and renders; the model only ever sees this compact line, so
 * conversation context stays small (cost) while still letting it reason about
 * follow-ups.
 */
export function summarize(specs: ComponentSpec[]): string {
  const parts: string[] = [];
  for (const s of specs) {
    switch (s.kind) {
      case "metric_row":
        parts.push(
          s.metrics
            .map(
              (m) =>
                `${m.label} ${m.unit === "$" ? "$" : ""}${m.value}${m.unit && m.unit !== "$" ? " " + m.unit : ""}` +
                (m.deltaWoW !== undefined ? ` (${m.deltaWoW >= 0 ? "+" : ""}${m.deltaWoW}% WoW)` : ""),
            )
            .join("; "),
        );
        break;
      case "attention_feed": {
        if (s.items.length === 0) { parts.push("attention feed clear"); break; }
        // Exact category counts (incl. DOA) so the verdict can't approximate — the
        // agent once said "two DOA claims" when the feed had more (R3 follow-up).
        const cases = s.items.filter((i) => i.kind === "case");
        const doa = cases.filter((i) => /DOA claim/i.test(i.headline)).length;
        const requests = s.items.filter((i) => i.kind === "request").length;
        const messages = s.items.filter((i) => i.kind === "message").length;
        const bits = [
          `${cases.length} open case${cases.length === 1 ? "" : "s"}${doa ? ` (${doa} DOA claim${doa === 1 ? "" : "s"})` : ""}`,
          `${requests} request${requests === 1 ? "" : "s"}`,
          `${messages} unanswered message${messages === 1 ? "" : "s"}`,
        ].filter((b) => !/^0 /.test(b));
        parts.push(
          `attention feed: ${s.items.length} item(s) — ${bits.join(", ")}. ` +
            `Top: ${s.items.slice(0, 3).map((i) => i.headline).join(" | ")}. ` +
            `These counts are exact and on screen; any number you state MUST match them.`,
        );
        break;
      }
      case "day_brief":
        parts.push(
          `synthetic today is ${s.weekday} — ${s.label}. Goal: ${s.goal}. ` +
            `Priorities: ${s.priorities.map((p) => p.label).join("; ")}. Reminder: ${s.reminder}`,
        );
        break;
      case "auction_board": {
        const top = s.lots[0];
        const phase =
          s.state === "closed"
            ? `CLOSED — the auction ended at ${s.closesAt}. Report it as closed/final; do NOT say it is live or "heading into close".`
            : s.state === "upcoming"
              ? `not open yet (opens Thursday)`
              : `LIVE — closes ${s.closesAt}`;
        parts.push(
          `auction board [${phase}]: ${s.lots.length} lot(s)` +
            (top ? `, top “${top.name}” at ${usd(top.currentBidCents)} (${top.bidCount} bids)` : ""),
        );
        break;
      }
      case "merge_card":
        parts.push(
          `merge candidate ${s.customer.displayName}: ${s.orders.length} orders on ${s.orders.map((o) => o.platform).join("+")} → one box, one shipping fee`,
        );
        break;
      case "report": {
        const rev = s.sections.find((x) => x.kind === "metrics")?.metrics?.[0];
        parts.push(
          `weekly report ${s.weekLabel}` +
            (rev ? `, revenue ${usd(rev.value * 100)}` : "") +
            `, sections: ${s.sections.map((x) => x.title).join("; ")}`,
        );
        break;
      }
      case "timeseries":
        parts.push(`timeseries “${s.title}” (${s.series[0]?.points.length ?? 0} points)`);
        break;
      case "verdict_card":
        parts.push(`verdict: ${s.verdict}`);
        break;
      default:
        parts.push(s.kind);
    }
  }
  return parts.length ? `Rendered for the user: ${parts.join(" · ")}` : "Rendered (no rows).";
}

const asText = (value: string) => ({ type: "text" as const, value });

export const reefTools = {
  dayBrief: tool({
    description:
      "Call this when the owner selects a synthetic demo weekday or asks what today's priorities, command brief, work plan, or reminders are. The [SYNTHETIC DEMO TODAY: ...] marker in the user message is authoritative; never use the real wall-clock weekday.",
    inputSchema: z.object({
      day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
    }),
    execute: async ({ day }) => dayBriefSpec(day),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  whatNeedsAttention: tool({
    description:
      "Call this when the owner asks what needs attention, what's urgent, their morning triage, customer messages, order exceptions, holds, address changes, or what must be cleared before shipping-label approval. This is the exact tool for 'Show me the order exceptions to clear before we purchase shipping labels.' It returns cases, customer requests, and unanswered messages as an attention feed; it does NOT prepare a label manifest.",
    inputSchema: z.object({}),
    execute: async () => attentionFeed(ch(), pg()),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  revenuePulse: tool({
    description:
      "Call this for the current cycle's revenue and orders — 'how's business', 'revenue', 'sales', 'how are we doing'. Returns a metric row (week-to-date vs the same point last cycle) and an hourly revenue chart.",
    inputSchema: z.object({}),
    execute: async () => revenuePulse(ch()),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  auctionBoard: tool({
    description:
      "Call this for the auction — 'how's the auction going', 'bids', 'the board', 'what's leading'. Pass the weekday from the authoritative [SYNTHETIC DEMO TODAY: ...] marker. Returns the selected demo day's time-bounded board with truthful live/closed bid totals and leaders.",
    inputSchema: z.object({
      day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
    }),
    execute: async ({ day }) => auctionBoard(ch(), day),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  winnerNextSteps: tool({
    description:
      "Call this only when the owner asks to review Saturday winner next steps for payment, add-ons, and shipping. It returns the closed board plus a synthetic review card. It never sends or claims to send a customer message.",
    inputSchema: z.object({}),
    execute: async () => winnerNextSteps(ch()),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  listingPlan: tool({
    description:
      "Call this for Tuesday listing work: the Thursday ReefnBid publish target, new Shopify arrival drafts, the eBay sync assumption, or the human inventory reminder. It returns a synthetic review card and never publishes a listing.",
    inputSchema: z.object({}),
    execute: async () => listingPlan(),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  promotionPlan: tool({
    description:
      "Call this for Wednesday auction-start and Shopify-arrival reminders, Friday momentum/last-call ads, or Sunday's next-auction announcement. It returns a synthetic draft review card and never sends email or SMS.",
    inputSchema: z.object({
      day: z.enum(["wednesday", "friday", "sunday"]),
    }),
    execute: async ({ day }) => promotionPlan(day),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  scanMerges: tool({
    description:
      "Call this to find cross-platform orders that should combine into one shipment — 'any orders to merge', 'combine orders', 'one box'. Returns merge cards where the same customer has unshipped orders on 2+ platforms.",
    inputSchema: z.object({}),
    execute: async () => mergeScan(pg()),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  weeklyReport: tool({
    description:
      "Call this for the full weekly report — 'weekly report', 'how did the week go', 'last week', 'top 10', 'reef health report'. Returns public-safe platform totals, category movement, auction top 10, and the auction→add-on funnel, all against synthetic history. Pass weekIndex for a specific past cycle; omit for the last complete cycle.",
    inputSchema: z.object({
      weekIndex: z
        .number()
        .int()
        .optional()
        .describe("Absolute cycle index. Omit for the most recent complete cycle."),
    }),
    execute: async ({ weekIndex }) => weeklyReport(ch(), pg(), weekIndex),
    toModelOutput: (output) => asText(summarize(output)),
  }),
};

export const SYSTEM = `You are Reef Command, the merchant cockpit for a synthetic live-coral-store demo inspired by physical-commerce problems. The workflow, customer bands, account links, timing, economics, and rules are invented fixtures and are not TIA Coral's operating playbook. You are a calm, brief co-pilot ("Teddy") — never chatty.

THE WEEK: SUN add-ons + next-auction announcement review → MON shipping documents → TUE shipping + ReefnBid/Shopify listing prep → WED shipping + email/SMS promotion review → THU ReefnBid opens → FRI auction momentum + last-call review → SAT closing night + winners. eBay mirrors Shopify in this synthetic demo, but human staff verify inventory and update Shopify directly. Six coral categories: zoas, euphyllia, goni, mushroom, sps, other.

HOW YOU ANSWER — this is a visual product, not a wall of text:
- For any question about the business, CALL THE RIGHT TOOL. The tool renders the real answer as interactive components on screen.
- After the tool, add ONE short sentence (≤140 chars) as your verdict — interpret or point, don't re-list the numbers the components already show.
- Use plain, commercial language. Do not use em dashes; use a period, colon, or comma instead.
- Pick the tool by intent (each tool's description says when to use it). You may call more than one if the question genuinely spans them.
- Every owner message may start with [SYNTHETIC DEMO TODAY: WEEKDAY — BUSINESS DAY]. That marker is the authoritative "today" for the synthetic environment. Never replace it with the real wall-clock weekday.
- When calling auctionBoard, pass that marker's weekday so the board is time-bounded to the selected demo day.
- When the owner asks to review Saturday winner next steps, call winnerNextSteps. Treat its card as a review artifact and never claim a message was sent.
- Tuesday listing questions call listingPlan. Wednesday/Friday/Sunday promotion questions call promotionPlan with the marker's weekday. These are review artifacts: never claim a listing was published or a message was sent.
- When the owner selects a day or asks today's priorities, call dayBrief for that weekday. Give the brief and reminder first; do not automatically execute the listed work. Wait for the owner to click or ask for the next tool.
- A [SYNTHETIC ROUTINE: ... structured_component_required=true] marker means the owner clicked a job. Call the matching live tool on this turn even if the same prompt appears earlier in history. A text-only answer is a failed routine, not completion.
- A message containing [SYNTHETIC SHIP TRACE: ...] comes from the cockpit's completed automation card. For that message only, do NOT call whatNeedsAttention. Briefly explain only the supplied trace facts, then ask exactly: "Want to see everything else that needs attention?"
- If the owner's next message confirms that trace follow-up, call whatNeedsAttention and render the complete attention feed. Do not add revenue or unrelated tools unless asked.
- Intent boundary on Monday: questions about exceptions/messages/holds/address changes to CLEAR BEFORE shipping-document approval call whatNeedsAttention. Only an explicit request to PREPARE/RUN/BUILD shipping documents or the label manifest calls prepareLabelDay.

HARD RULES (never break):
- NEVER fabricate a number, price, date, handle, or policy. Every business figure must come from a tool result. If no tool covers the question, say so plainly in one sentence — do not guess or invent.
- Counts must match the components exactly. Never state a quantity the tool result doesn't support (e.g. how many DOA claims or items need attention). When unsure, point qualitatively ("DOA claims are the priority") instead of guessing a number.
- Money is human-only. Never approve or claim to have made a refund, charge, purchase, payout, or price change. If asked, say it's routed to a human decision; do not pretend it's done.
- No free-form promises to customers. You are talking to the owner, not a buyer.
- If data doesn't exist, an honest "I don't have that" beats a plausible guess. Always.`;
