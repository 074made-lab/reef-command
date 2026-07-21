/**
 * Concierge intake — the LIVE half of /shop.
 *
 * A buyer's question is written to the same event stream the merchant runs on:
 * one `message_in` event into ClickHouse. The merchant cockpit's attention feed
 * already surfaces unanswered `message_in` rows, so the question appears there
 * with no further wiring — the two surfaces are provably one protocol. The
 * concierge does not ANSWER yet (that side stays an honest preview); a human
 * sees it in the cockpit and decides.
 *
 * Synthetic-demo boundary: this writes a demo event; it never emails, messages,
 * or contacts anyone.
 */
import { NextResponse } from "next/server";
import type { ClickHouseClient } from "@clickhouse/client";
import { randomUUID } from "node:crypto";
import { chClient, insertEvents } from "@/lib/store/clickhouse";

let chSingleton: ClickHouseClient | undefined;
const ch = () => (chSingleton ??= chClient());

export async function POST(req: Request) {
  let question = "";
  try {
    question = String(((await req.json()) as { question?: unknown }).question ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  if (question.length < 3 || question.length > 280) {
    return NextResponse.json(
      { ok: false, error: "question must be 3–280 characters" },
      { status: 400 },
    );
  }

  const id = `shop-${randomUUID()}`;
  await insertEvents(ch(), [
    {
      ts: new Date().toISOString(),
      type: "message_in",
      platform: "web",
      meta: { id, preview: question.slice(0, 140), channel: "concierge" },
    },
  ]);
  return NextResponse.json({ ok: true, id });
}
