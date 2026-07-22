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
  addonOrderBoard,
  attentionFeed,
  auctionAnnouncement,
  auctionBoard,
  listingPlan,
  mergeScan,
  promotionPlan,
  revenuePulse,
  shippingCommand,
  shippingBlockerBoard,
  winnerNextSteps,
  weeklyReport,
} from "./tools";
import type { ComponentSpec } from "./protocol";
import { dayBriefSpec } from "./demo-clock";
import { buildShippingDocumentBoard } from "./label-day";

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
      case "shipping_blocker_board":
        parts.push(`Monday blockers at ${s.asOf}: ${s.groups.map((group) => `${group.label} ${group.count} ${group.unit}`).join(", ")}; ${s.openCount} open queue record(s)`);
        break;
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
      case "addon_order_board":
        parts.push(
          `add-on order board: ${s.totalOrders} order(s), ${s.coralUnits} coral unit(s), ${s.combineReady} combine-ready`,
        );
        break;
      case "merge_batch":
        parts.push(
          `merge run: ${s.candidates} ReefnBid-anchored shipment(s), ${s.readyCandidates} still ready, ${s.addonOrders} add-on order(s), ${s.coralUnits} total coral unit(s)${s.readyCandidates ? "; Merge all requires a human click" : "; all reconciled merges remain visible"}`,
        );
        break;
      case "shipping_document_board":
        parts.push(`Monday shipping documents at ${s.asOf}: ${s.packingSlips} packing slip(s), ${s.fedexLabels} eligible FedEx document(s), ${s.productLabels} one-per-coral bag label(s), ${s.shipments.length} shipment packing-board row(s); previews require approval and holds withhold carrier labels`);
        break;
      case "shipment_command_board":
        parts.push(`${s.day} shipment command at ${s.asOf}: ${s.shipments.length} shipment(s), ${s.issues.length} issue(s), ${s.issues.filter((issue) => issue.severity === "urgent").length} urgent; exact order, shipment, tracking, destination, status, and action details render on screen`);
        break;
      case "staff_agent_board":
        parts.push(`${s.title} at ${s.asOf}: ${s.tasks.length} staff task(s); ${s.tasks.map((task) => `${task.title} → ${task.owner} / ${task.agent}`).join("; ")}; every SMS and agent activation is simulated`);
        break;
      case "auction_announcement":
        parts.push(
          `next auction ${s.dateRange}, closes ${s.closeTime}; ${s.emailRecipients} email recipient(s), ${s.smsRecipients} SMS recipient(s); simulated send requires a human click`,
        );
        break;
      case "merge_card":
        parts.push(
          `merge candidate ${s.customer.displayName}: ReefnBid anchor ${s.anchorOrderId} + ${s.addonOrderCount} add-on order(s) = ${s.totalCoralUnits} coral unit(s) in one combined box`,
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
  addonOrderBoard: tool({
    description:
      "Call only this tool for Sunday's 'Watch add-on orders' monitor or when the owner asks for the add-on order board, add-on volume, coral units, channels, value, or anchor matches. It returns a read-only live synthetic Postgres board with no merge action; do not also call scanMerges unless the owner starts Step 2.",
    inputSchema: z.object({}),
    execute: async () => addonOrderBoard(pg()),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  auctionAnnouncement: tool({
    description:
      "Call this for Sunday's next-auction announcement. It returns the next Thursday-through-Saturday dates, Saturday 8 PM ET close, email and SMS recipient counts, both drafts, and one human-gated simulated-send button. It never contacts an external recipient.",
    inputSchema: z.object({}),
    execute: async () => auctionAnnouncement(pg()),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  whatNeedsAttention: tool({
    description:
      "Call this when the owner asks what needs attention, what's urgent, their morning triage, customer messages, order exceptions, holds, address changes, or what must be cleared before shipping-label approval. This is the exact tool for 'Show me the order exceptions to clear before we purchase shipping labels.' It returns cases, customer requests, and unanswered messages as an attention feed; it does NOT prepare a label manifest.",
    inputSchema: z.object({}),
    execute: async () => attentionFeed(ch(), pg()),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  shippingBlockers: tool({
    description:
      "Call this only for Monday Step 1, 'Clear shipping blockers'. It renders the live three-lane board for hold order requests, replacement coral items, and customer questions, followed by the detailed queue used to resolve them. It does not prepare or purchase labels.",
    inputSchema: z.object({}),
    execute: async () => shippingBlockerBoard(ch(), pg()),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  shippingDocuments: tool({
    description:
      "Call this only for Monday Step 3, 'Prepare shipping docs'. It renders print-ready packing slips, synthetic FedEx label previews, one product label per coral bag, weather ice/heat-pack checks, box sizes and weights, with miniature examples. The board includes a separate owner-gated purchase button; rendering the board alone never purchases a label.",
    inputSchema: z.object({}),
    execute: async () => buildShippingDocumentBoard(pg()),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  shippingCommand: tool({
    description:
      "Call this for Tuesday Step 1, Wednesday Steps 1–2, or Thursday Step 3. Pass the selected day and scope=ship for today's manifest or scope=monitor for the prior day's overnight watch. It returns exact synthetic order, shipment, tracking, destination, issue, recommendation, and working action data.",
    inputSchema: z.object({
      day: z.enum(["tuesday", "wednesday"]),
      scope: z.enum(["ship", "monitor"]),
    }),
    execute: async ({ day, scope }) => shippingCommand(day, scope),
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
      "Call this for Tuesday Step 2 or 3. Use scope=listings for the ReefnBid and Shopify local-agent checklist. Use scope=inventory for the human physical inspection, Shopify update, eBay mirror check, and simulated staff SMS. It never publishes a listing or changes inventory.",
    inputSchema: z.object({ scope: z.enum(["listings", "inventory"]) }),
    execute: async ({ scope }) => listingPlan(scope),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  promotionPlan: tool({
    description:
      "Call this for Wednesday auction-start and Shopify-arrival reminders or Friday momentum/last-call ads. Sunday's full next-auction package belongs to auctionAnnouncement. This tool returns a synthetic draft review card and never sends email or SMS.",
    inputSchema: z.object({
      day: z.enum(["wednesday", "friday"]),
    }),
    execute: async ({ day }) => promotionPlan(day),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  scanMerges: tool({
    description:
      "Call this for Sunday or Monday Step 2 'Combine eligible orders', 'Merge all', or an explicit request to merge. Do not call it for Sunday's Step 1 add-on monitor. ReefnBid remains the anchor on both days. Pass the weekday from the synthetic marker so the command timestamp is correct.",
    inputSchema: z.object({ day: z.enum(["sunday", "monday"]) }),
    execute: async ({ day }) => mergeScan(pg(), day),
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
- Sunday's add-on monitor calls ONLY addonOrderBoard, never scanMerges or revenuePulse; it is read-only and has no action. Sunday and Monday Step 2 call ONLY scanMerges with the selected day: ReefnBid is the anchor and only winner-code Shopify/eBay orders are add-ons; counts must reconcile, and Merge all belongs here. Sunday's next-auction task calls auctionAnnouncement, which renders both drafts and a human-gated simulated-send button. Never claim an external message was sent. Tuesday Step 1 calls shippingCommand with day=tuesday and scope=ship. Tuesday Step 2 calls listingPlan with scope=listings. Tuesday Step 3 calls listingPlan with scope=inventory. Wednesday Step 1 calls shippingCommand with day=wednesday and scope=ship. Wednesday Step 2 calls shippingCommand with day=wednesday and scope=monitor. Wednesday Step 3 calls the existing weeklyReport tool.
- When the owner selects a day or asks today's priorities, call dayBrief for that weekday. Give the brief and reminder first; do not automatically execute the listed work. Wait for the owner to click or ask for the next tool.
- A [SYNTHETIC ROUTINE: ... structured_component_required=true] marker means the owner clicked a job. Call the matching live tool on this turn even if the same prompt appears earlier in history. A text-only answer is a failed routine, not completion.
- A message containing [SYNTHETIC SHIP TRACE: ...] comes from the cockpit's completed automation card. For that message only, do NOT call whatNeedsAttention. Briefly explain only the supplied trace facts, then ask exactly: "Want to see everything else that needs attention?"
- If the owner's next message confirms that trace follow-up, call whatNeedsAttention and render the complete attention feed. Do not add revenue or unrelated tools unless asked.
- Monday Step 1 calls shippingBlockers for the hold-request, replacement-item, and customer-question board. Monday Step 2 calls scanMerges with day=monday. Monday Step 3 calls shippingDocuments for printable packing slips, synthetic FedEx previews, one bag label per coral, weather packs, and box sizes. Do not call prepareLabelDay unless the owner separately and explicitly asks to start the money-gated carrier-label purchase run.
- Tuesday Step 1 must call shippingCommand, not the generic attention feed. Tuesday's autonomous last-minute hold request remains a separate Trigger.dev alert; never suppress or duplicate it inside the command board.
- Wednesday is the final regular ship day. Its overnight watch must preserve joined customer, order, shipment, tracking, and delivery facts; delayed boxes require an owner reminder to contact FedEx, and coral-health reports require immediate care guidance plus the DOA claim path.

HARD RULES (never break):
- NEVER fabricate a number, price, date, handle, or policy. Every business figure must come from a tool result. If no tool covers the question, say so plainly in one sentence — do not guess or invent.
- Counts must match the components exactly. Never state a quantity the tool result doesn't support (e.g. how many DOA claims or items need attention). When unsure, point qualitatively ("DOA claims are the priority") instead of guessing a number.
- Money is human-only. Never approve or claim to have made a refund, charge, purchase, payout, or price change. If asked, say it's routed to a human decision; do not pretend it's done.
- No free-form promises to customers. You are talking to the owner, not a buyer.
- If data doesn't exist, an honest "I don't have that" beats a plausible guess. Always.`;
