/**
 * Label day — the durable Trigger.dev task with a human waitpoint.
 *
 * The manifest is built ONCE by the chat tool and passed in as the task payload,
 * so the card the owner approves is the exact immutable manifest the task later
 * buys (no build-twice race — R2-M1). The task publishes the token + progress to
 * run metadata, PAUSES on the waitpoint, and on approval purchases labels one by
 * one (idempotent + ClickHouse-failure-visible, see lib/label-day.ts) while
 * streaming progress via metadata (Realtime) — the second OLTP→OLAP loop, gated
 * by Trigger.dev's native HITL. A human-approval flow does not auto-replay
 * (maxAttempts: 1).
 */
import { task, wait, metadata } from "@trigger.dev/sdk";
import { chClient } from "../lib/store/clickhouse";
import { pgPool } from "../lib/store/postgres";
import { purchaseLabels, type Manifest } from "../lib/label-day";

type Approval = { status: "approved" | "declined" };

export const labelDay = task({
  id: "label-day",
  maxDuration: 3600,
  retry: { maxAttempts: 1 },
  run: async (payload: { manifest: Manifest }) => {
    const { manifest } = payload;
    if (!manifest?.shipments?.length) return { status: "empty" as const };

    const ch = chClient();
    const pg = pgPool();

    // Publish token + progress (small fields only, not the full manifest — the
    // card already rendered it), then pause on the waitpoint.
    const token = await wait.createToken({ timeout: "1h", tags: ["label-day"] });
    metadata.set("approvalTokenId", token.id);
    metadata.set("shipments", manifest.shipments.length);
    metadata.set("totalCostCents", manifest.totalCostCents);
    metadata.set("purchased", 0);
    metadata.set("status", "awaiting-approval");

    const result = await wait.forToken<Approval>(token);
    if (!result.ok || result.output?.status !== "approved") {
      metadata.set("status", "declined");
      await ch.close();
      return { status: "declined" as const };
    }

    // Approved — buy one by one so the UI sees labels land in real time.
    metadata.set("status", "purchasing");
    let purchased = 0, spend = 0;
    const nowIso = new Date().toISOString();
    for (const s of manifest.shipments) {
      const out = await purchaseLabels(pg, ch, { ...manifest, shipments: [s] }, nowIso);
      purchased += out.purchased;
      spend += out.totalCostCents;
      metadata.set("purchased", purchased);
    }

    metadata.set("status", "purchased");
    await ch.close();
    return { status: "purchased" as const, count: purchased, totalCostCents: spend };
  },
});
