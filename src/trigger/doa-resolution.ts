/**
 * Human-approved, public-safe DOA resolution proof.
 *
 * The route verifies the owner and stages the synthetic fixture before this
 * task starts. Trigger.dev then makes every downstream effect observable:
 * decision → replacements → old label void → packing list → updated label →
 * reply draft. No customer message is sent.
 */
import { metadata, task, wait } from "@trigger.dev/sdk";
import {
  decideDemoDoaClaim,
  prepareDemoDoaReply,
  purchaseDemoUpdatedLabel,
  rebuildDemoPackingList,
  recordDemoReplacements,
  voidDemoDoaLabel,
} from "../lib/doa-demo";
import { chClient } from "../lib/store/clickhouse";
import { pgPool } from "../lib/store/postgres";

export type DoaResolutionPayload = {
  approvalId: string;
  approvedBy: string;
  approvedAt: string;
};

export const doaResolution = task({
  id: "doa-resolution",
  maxDuration: 180,
  retry: { maxAttempts: 3 },
  run: async (payload: DoaResolutionPayload) => {
    const pg = pgPool();
    const ch = chClient();
    try {
      metadata.set("status", "approval-recorded");
      metadata.set("approvalId", payload.approvalId);
      metadata.set("replacementCount", 3);
      metadata.set("replySent", false);
      await decideDemoDoaClaim(pg, ch, payload.approvalId, payload.approvedBy, payload.approvedAt);

      await wait.for({ seconds: 1 });
      await recordDemoReplacements(pg, ch, payload.approvalId, payload.approvedBy);
      metadata.set("status", "replacements-recorded");

      await wait.for({ seconds: 1 });
      await voidDemoDoaLabel(pg, ch, payload.approvalId, payload.approvedBy, new Date().toISOString());
      metadata.set("status", "old-label-voided");

      await wait.for({ seconds: 1 });
      const packingItems = await rebuildDemoPackingList(pg, ch, payload.approvalId, payload.approvedBy);
      metadata.set("packingItems", packingItems);
      metadata.set("status", "packing-list-ready");

      await wait.for({ seconds: 1 });
      await purchaseDemoUpdatedLabel(pg, ch, payload.approvalId, payload.approvedBy, new Date().toISOString());
      metadata.set("status", "updated-label-purchased");

      await wait.for({ seconds: 1 });
      await prepareDemoDoaReply(pg, ch, payload.approvalId, payload.approvedBy);
      metadata.set("status", "reply-draft-ready");

      await wait.for({ seconds: 1 });
      metadata.set("status", "completed");
      return {
        status: "completed" as const,
        replacementCount: 3,
        packingItems,
        replySent: false,
      };
    } catch (error) {
      metadata.set("status", "failed");
      metadata.set("error", error instanceof Error ? error.message : "DOA resolution failed");
      throw error;
    } finally {
      await ch.close().catch(() => {});
    }
  },
});
