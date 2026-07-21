import { runs } from "@trigger.dev/sdk";
import { pgPool } from "@/lib/store/postgres";
import {
  DEMO_SHIP_EXCEPTION_ID,
  freshHandledDemoShipDayIncident,
  stageDemoShipDayRequest,
} from "@/lib/ship-day-exception";
import { shipDayException } from "@/trigger/ship-day-exception";

export async function POST() {
  try {
    // Intentionally unauthenticated: this route only replays a deterministic,
    // synthetic, non-money event. Fresh completed incidents are read back
    // instead of spawning another Trigger run on every Tuesday reload.
    const recent = await freshHandledDemoShipDayIncident(pgPool());
    if (recent) {
      return Response.json({ ok: true, reused: true, status: "protected", incident: recent });
    }
    // Simulate an external customer request entering the system. From this
    // point onward the Trigger task acts without an owner prompt or click.
    const incident = await stageDemoShipDayRequest(pgPool());
    // Pass the staged incident into the run: retries must reuse it, never
    // re-select a different shipment mid-incident.
    const handle = await shipDayException.trigger({ incidentId: DEMO_SHIP_EXCEPTION_ID, incident });
    return Response.json({ ok: true, runId: handle.id, incident });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "could not stage ship-day exception",
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId) return Response.json({ ok: false, error: "runId required" }, { status: 400 });
  try {
    const run = await runs.retrieve(runId);
    if (run.taskIdentifier !== "ship-day-exception") {
      return Response.json({ ok: false, error: "not a ship-day exception run" }, { status: 400 });
    }
    return Response.json({ ok: true, runId, metadata: run.metadata ?? {} });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "could not read ship-day exception",
    }, { status: 500 });
  }
}
