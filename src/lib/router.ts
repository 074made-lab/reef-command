/**
 * Deterministic keyword router — the placeholder brain. The Trigger.dev
 * chat.agent() LLM runtime replaces exactly this function later; the tool
 * layer and the component protocol on either side stay unchanged.
 *
 * Clients are created once at module level (pgPool memoizes internally;
 * the ClickHouse client is a keep-alive HTTP client).
 */

import { chClient } from "./store/clickhouse";
import { pgPool } from "./store/postgres";
import {
  attentionFeed,
  auctionBoard,
  mergeScan,
  revenuePulse,
  weeklyReport,
} from "./tools";
import type { ChatResponse, ComponentSpec } from "./protocol";
import { dayBriefSpec, parseDemoDayContext, stripDemoDayContext } from "./demo-clock";

const ch = chClient();
const pg = pgPool();

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

function firstOf<K extends ComponentSpec["kind"]>(
  specs: ComponentSpec[],
  kind: K,
): Extract<ComponentSpec, { kind: K }> | undefined {
  return specs.find((s) => s.kind === kind) as
    | Extract<ComponentSpec, { kind: K }>
    | undefined;
}

async function attention(): Promise<ChatResponse> {
  const feed = await attentionFeed(ch, pg);
  const n = firstOf(feed, "attention_feed")?.items.length ?? 0;
  return {
    verdict:
      n === 0
        ? "Feed clear. Nothing needs you."
        : `${plural(n, "thing")} need${n === 1 ? "s" : ""} your attention.`,
    components: feed,
  };
}

async function revenue(): Promise<ChatResponse> {
  const specs = await revenuePulse(ch);
  const m = firstOf(specs, "metric_row")?.metrics ?? [];
  const wtd = m[0];
  const orders = m[1];
  const wow =
    wtd?.deltaWoW !== undefined
      ? `, ${wtd.deltaWoW >= 0 ? "+" : ""}${wtd.deltaWoW}% WoW`
      : "";
  return {
    verdict: wtd
      ? `${usd(wtd.value)} this cycle so far${wow} — ${plural(orders?.value ?? 0, "order")}.`
      : "Revenue pulse below.",
    components: specs,
  };
}

async function auction(message: string): Promise<ChatResponse> {
  const dayId = parseDemoDayContext(message);
  const specs = await auctionBoard(ch, dayId);
  const board = firstOf(specs, "auction_board");
  const lots = board?.lots ?? [];
  const top = lots[0];
  const closed = board?.state === "closed";
  return {
    verdict: top
      ? closed
        ? `Auction closed Saturday — final board: “${top.name}” hammered at ${usd(Math.round(top.currentBidCents / 100))} (${plural(top.bidCount, "bid")}).`
        : `${plural(lots.length, "lot")} live — “${top.name}” leads at ${usd(Math.round(top.currentBidCents / 100))} with ${plural(top.bidCount, "bid")}.`
      : "No bids on the board this cycle yet.",
    components: specs,
  };
}

async function merges(): Promise<ChatResponse> {
  const specs = await mergeScan(pg);
  const n = specs.filter((s) => s.kind === "merge_card").length;
  return {
    verdict:
      n === 0
        ? "No cross-platform merge candidates right now — every open order is single-platform."
        : `${plural(n, "cross-platform merge candidate")} found — one box, one shipping fee each.`,
    components: specs,
  };
}

async function report(): Promise<ChatResponse> {
  const specs = await weeklyReport(ch, pg);
  const rep = firstOf(specs, "report");
  const revMetric =
    rep?.sections.find((s) => s.kind === "metrics")?.metrics[0];
  return {
    verdict: rep
      ? `Cycle ${rep.weekLabel} closed${revMetric ? ` at ${usd(revMetric.value)}` : ""} — the full picture, against history.`
      : "Weekly report below.",
    components: specs,
  };
}

async function fallback(): Promise<ChatResponse> {
  const feed = await attentionFeed(ch, pg);
  return {
    verdict:
      "I answer: attention, revenue, auction board, merges, weekly report. Meanwhile — the feed:",
    components: feed,
  };
}

async function dayBrief(message: string): Promise<ChatResponse> {
  const dayId = parseDemoDayContext(message) ?? "monday";
  const specs = dayBriefSpec(dayId);
  const brief = firstOf(specs, "day_brief");
  return {
    verdict: brief
      ? `Today is ${brief.weekday} — ${brief.label}. Start with “${brief.priorities[0]?.label}”; Teddy will keep the gate visible.`
      : "Today's command brief is below.",
    components: specs,
  };
}

/** message → ChatResponse. Deterministic, ordered keyword rules. */
export async function routeChat(message: string): Promise<ChatResponse> {
  const raw = message.toLowerCase();
  const q = stripDemoDayContext(message).toLowerCase();
  try {
    if (/\[synthetic ship trace:/.test(raw)) {
      return {
        verdict: "Packing was notified and the label was handled before carrier handoff. Want to see everything else that needs attention?",
        components: [],
      };
    }
    if (/command brief|today'?s (?:work )?priorit|remind me not to miss/.test(q))
      return await dayBrief(message);
    if (/attention|morning|needs? my|need me|exceptions?|holds?|address changes?|clear before (?:label|shipping)/.test(q))
      return await attention();
    if (/report|weekly|last week|top\s?-?10|top ten|hammer/.test(q))
      return await report();
    if (/auction|bids?|board/.test(q)) return await auction(message);
    if (/merge|combine|orders?/.test(q)) return await merges();
    if (/revenue|business|sales|how are we|how'?s (it|the week)/.test(q))
      return await revenue();
    return await fallback();
  } catch (err) {
    return {
      verdict: "The stores didn't answer — showing the error, not a guess.",
      components: [
        {
          kind: "verdict_card",
          verdict: "Couldn't reach the live data stores for this answer.",
          confidence: "low",
          evidence: [
            {
              label: "error",
              detail: err instanceof Error ? err.message : String(err),
            },
            {
              label: "next step",
              detail:
                "Check CLICKHOUSE_URL / POSTGRES_URL in .env.local, then ask again.",
            },
          ],
        },
      ],
    };
  }
}
