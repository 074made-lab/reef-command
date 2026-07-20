/**
 * Reef Command chat agent — the LLM brain.
 *
 * A durable Trigger.dev `chat.agent()` running Claude (Sonnet) via the Vercel
 * AI SDK. The five live-store reads in `lib/tools.ts` are registered as typed
 * agent tools; Claude decides which to call and the tool renders the answer as
 * ComponentSpecs. This is the LLM runtime the deterministic `lib/router.ts`
 * seam was always a placeholder for — the tool layer and component protocol on
 * either side are unchanged. `lib/router.ts` + `/api/chat` remain as an
 * offline fallback path.
 *
 * Token discipline (promised to the owner): Sonnet + a small fixed system
 * prompt + compact `toModelOutput` summaries (the model never re-reads full
 * component JSON across turns) + the $10 hard-capped workspace key.
 */
import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { chClient } from "../lib/store/clickhouse";
import { pgPool } from "../lib/store/postgres";
import {
  attentionFeed,
  auctionBoard,
  mergeScan,
  revenuePulse,
  weeklyReport,
} from "../lib/tools";
import type { ComponentSpec } from "../lib/protocol";

const MODEL = "claude-sonnet-5";

// Store clients created once at module level (pgPool memoizes; the ClickHouse
// client is a keep-alive HTTP client). Reused across every tool call.
const ch = chClient();
const pg = pgPool();

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/**
 * Model-facing summary of a rendered answer. The full ComponentSpec[] streams
 * to the frontend and renders; the model only ever sees this compact line, so
 * conversation context stays small (cost) while still letting it reason about
 * follow-ups.
 */
function summarize(specs: ComponentSpec[]): string {
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
      case "attention_feed":
        parts.push(
          s.items.length === 0
            ? "attention feed clear"
            : `${s.items.length} attention item(s): ${s.items.slice(0, 3).map((i) => i.headline).join(" | ")}`,
        );
        break;
      case "auction_board": {
        const top = s.lots[0];
        parts.push(
          `auction board: ${s.lots.length} lot(s)` +
            (top ? `, top “${top.name}” at ${usd(top.currentBidCents)} (${top.bidCount} bids)` : "") +
            `, closes ${s.closesAt}`,
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

const tools = {
  whatNeedsAttention: tool({
    description:
      "Call this when the owner asks what needs their attention, what's urgent, their morning triage, or 'anything I should handle'. Returns open cases, customer requests, and unanswered messages as an attention feed.",
    inputSchema: z.object({}),
    execute: async () => attentionFeed(ch, pg),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  revenuePulse: tool({
    description:
      "Call this for the current cycle's revenue and orders — 'how's business', 'revenue', 'sales', 'how are we doing'. Returns a metric row (week-to-date vs the same point last cycle) and an hourly revenue chart.",
    inputSchema: z.object({}),
    execute: async () => revenuePulse(ch),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  auctionBoard: tool({
    description:
      "Call this for the auction — 'how's the auction going', 'bids', 'the board', 'what's leading'. Returns the current cycle's lots with live/closed bid totals and leaders.",
    inputSchema: z.object({}),
    execute: async () => auctionBoard(ch),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  scanMerges: tool({
    description:
      "Call this to find cross-platform orders that should combine into one shipment — 'any orders to merge', 'combine orders', 'one box'. Returns merge cards where the same customer has unshipped orders on 2+ platforms.",
    inputSchema: z.object({}),
    execute: async () => mergeScan(pg),
    toModelOutput: (output) => asText(summarize(output)),
  }),
  weeklyReport: tool({
    description:
      "Call this for the full weekly report — 'weekly report', 'how did the week go', 'last week', 'top 10', 'reef health report'. Returns platform & tier mix, retention, six product categories, auction top 10, and the auction→add-on funnel, all against history. Pass weekIndex for a specific past cycle; omit for the last complete cycle.",
    inputSchema: z.object({
      weekIndex: z
        .number()
        .int()
        .optional()
        .describe("Absolute cycle index. Omit for the most recent complete cycle."),
    }),
    execute: async ({ weekIndex }) => weeklyReport(ch, weekIndex),
    toModelOutput: (output) => asText(summarize(output)),
  }),
};

const SYSTEM = `You are Reef Command, the merchant cockpit for a live-coral store. The business is modeled on the real weekly operations of TIA Coral; all data here is synthetic and simplified. You are a calm, brief co-pilot ("Teddy") — never chatty.

THE WEEK: THU auction opens → SAT winners get payment + cross-platform discount codes → SUN–MON add-on orders (one shipping fee, add-on margin beats auction margin) → MON label day → TUE–WED combined shipping → WED weekly report. Six coral categories: zoas, euphyllia, goni, mushroom, sps, other.

HOW YOU ANSWER — this is a visual product, not a wall of text:
- For any question about the business, CALL THE RIGHT TOOL. The tool renders the real answer as interactive components on screen.
- After the tool, add ONE short sentence (≤140 chars) as your verdict — interpret or point, don't re-list the numbers the components already show.
- Pick the tool by intent (each tool's description says when to use it). You may call more than one if the question genuinely spans them.

HARD RULES (never break):
- NEVER fabricate a number, price, date, handle, or policy. Every business figure must come from a tool result. If no tool covers the question, say so plainly in one sentence — do not guess or invent.
- Money is human-only. Never approve or claim to have made a refund, charge, purchase, payout, or price change. If asked, say it's routed to a human decision; do not pretend it's done.
- No free-form promises to customers. You are talking to the owner, not a buyer.
- If data doesn't exist, an honest "I don't have that" beats a plausible guess. Always.`;

export const reefChat = chat.agent({
  id: "reef-chat",
  tools,
  run: async ({ messages, tools, signal }) =>
    streamText({
      // Spread FIRST — wires prepareStep (compaction/steering), telemetry, and
      // hands the typed tool set to streamText. Explicit fields below win.
      ...chat.toStreamTextOptions({ tools }),
      model: anthropic(MODEL),
      system: SYSTEM,
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(6),
    }),
});
