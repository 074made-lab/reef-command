/**
 * Label day — the durable Trigger.dev task with a human waitpoint.
 *
 * MON: build the label manifest from Postgres truth, publish it, then PAUSE on
 * a waitpoint token until the merchant approves the whole batch with one click.
 * On approval the run resumes and purchases labels one by one, streaming
 * progress via run metadata (Realtime) while each write lands in Postgres +
 * ClickHouse — the second OLTP→OLAP loop, gated by Trigger.dev's native HITL.
 *
 * The manifest/token are published to metadata BEFORE the pause so the chat
 * tool (`prepareLabelDay`) can render the card with an approve chip; the chip
 * routes through `/api/actions` → `wait.completeToken`.
 */
import { task, wait, metadata } from "@trigger.dev/sdk";
import { chClient } from "../lib/store/clickhouse";
import { pgPool } from "../lib/store/postgres";
import { buildManifest, purchaseLabels } from "../lib/label-day";

type Approval = { status: "approved" | "declined" };

export const labelDay = task({
  id: "label-day",
  maxDuration: 3600,
  run: async () => {
    const pg = pgPool();
    const ch = chClient();

    const manifest = await buildManifest(pg);
    if (manifest.shipments.length === 0) {
      return { status: "empty" as const };
    }

    // Publish the manifest + an approval token, THEN pause on the waitpoint.
    const token = await wait.createToken({ timeout: "1h", tags: ["label-day"] });
    metadata.set("manifest", manifest);
    metadata.set("approvalTokenId", token.id);
    metadata.set("shipments", manifest.shipments.length);
    metadata.set("purchased", 0);
    metadata.set("status", "awaiting-approval");

    const result = await wait.forToken<Approval>(token);
    if (!result.ok || result.output?.status !== "approved") {
      metadata.set("status", "declined");
      await ch.close();
      return { status: "declined" as const };
    }

    // Approved — purchase one by one so the UI sees labels land in real time.
    metadata.set("status", "purchasing");
    let purchased = 0, spend = 0;
    const nowIso = new Date().toISOString();
    for (const s of manifest.shipments) {
      const one = { ...manifest, shipments: [s] };
      const out = await purchaseLabels(pg, ch, one, nowIso);
      purchased += out.purchased;
      spend += out.totalCostCents;
      metadata.set("purchased", purchased);
    }

    metadata.set("status", "purchased");
    await ch.close();
    return { status: "purchased" as const, count: purchased, totalCostCents: spend };
  },
});
