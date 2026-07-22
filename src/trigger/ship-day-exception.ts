/**
 * Autonomous ship-day exception proof.
 *
 * The customer event is staged by the public demo route, then this durable task
 * handles it without an owner prompt: detect → notify packing by synthetic SMS
 * → void the still-voidable label → publish an auditable result.
 */
import { metadata, task, wait } from "@trigger.dev/sdk";
import { chClient } from "../lib/store/clickhouse";
import { pgPool } from "../lib/store/postgres";
import { tryDemoOperation } from "../lib/demo-operation-lock";
import {
  notifyPackingTeam,
  recordShipDayDetection,
  stageDemoShipDayRequest,
  voidShipDayLabel,
  type ShipDayIncident,
} from "../lib/ship-day-exception";

export const shipDayException = task({
  id: "ship-day-exception",
  maxDuration: 120,
  retry: { maxAttempts: 3 },
  run: async (payload: { incidentId: string; incident?: ShipDayIncident }) => {
    const pg = pgPool();
    const operation = await tryDemoOperation(pg);
    if (!operation) throw new Error("demo reset in progress");
    const ch = chClient();
    try {
      // The route stages the incident once and passes it in, so a mid-run
      // retry re-handles the SAME shipment instead of selecting (and voiding)
      // a second one after the first void already landed. Staging here is only
      // the fallback for a run fired without a payload (e.g. the dashboard).
      const incident = payload.incident ?? await stageDemoShipDayRequest(pg);
      metadata.set("status", "request-detected");
      metadata.set("incidentId", payload.incidentId);
      metadata.set("customerName", incident.customerName);
      metadata.set("shipmentId", incident.shipmentId);
      metadata.set("destination", incident.destination);
      metadata.set("protectedCostCents", incident.protectedCostCents);
      metadata.set("requestSummary", incident.requestSummary);
      await recordShipDayDetection(ch, incident);

      await wait.for({ seconds: 1 });
      await notifyPackingTeam(pg, ch, incident);
      metadata.set("status", "packing-notified");

      await wait.for({ seconds: 1 });
      await voidShipDayLabel(pg, ch, incident);
      metadata.set("status", "protected");

      return { status: "protected" as const, incident };
    } catch (error) {
      metadata.set("status", "failed");
      metadata.set("error", error instanceof Error ? error.message : "ship-day exception failed");
      throw error;
    } finally {
      await operation.release();
      await ch.close().catch(() => {});
    }
  },
});
