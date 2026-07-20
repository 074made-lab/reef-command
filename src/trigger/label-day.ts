/**
 * Label day — the durable Trigger.dev task with a human waitpoint.
 *
 * The manifest is built ONCE by the chat tool and passed in as the task payload,
 * so the card the owner approves is the exact immutable manifest the task later
 * buys (no build-twice race — R2-M1). The task publishes the token + progress to
 * run metadata, PAUSES on the waitpoint, and on approval purchases labels one by
 * one (recoverable-idempotent, see lib/label-day.ts) while surfacing progress
 * via run metadata that the UI polls — the second OLTP→OLAP loop, gated by
 * Trigger.dev's native HITL. A human-approval flow does not auto-replay
 * (maxAttempts: 1). A crash mid-purchase publishes a terminal 'failed' status so
 * the UI stops polling a run that will never finish (Codex R3-P1) — it does not
 * hang on 'purchasing' and then flip to a false green.
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
    try {
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
      return { status: "purchased" as const, count: purchased, totalCostCents: spend };
    } catch (err) {
      // Terminal failure — publish 'failed' (the UI stops polling and shows an
      // error, not a false green) and an operator-facing note, then rethrow so
      // Trigger records the run as failed.
      metadata.set("status", "failed");
      metadata.set("error", err instanceof Error ? err.message : "label-day run failed");
      throw err;
    } finally {
      await ch.close().catch(() => {});
    }
  },
});
