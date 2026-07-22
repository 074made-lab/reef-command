import { NextResponse } from "next/server";
import { runs } from "@trigger.dev/sdk";
import { acquireDemoReset } from "@/lib/demo-operation-lock";
import { OwnerAuthError, requireOwner } from "@/lib/owner-auth";
import { pgPool } from "@/lib/store/postgres";
import { resetSyntheticPostgres, type DemoSeedSummary } from "@/lib/synth/reset-postgres";
import { chClient } from "@/lib/store/clickhouse";
import { demoAuctionMoment, demoAuctionWeekIndex } from "@/lib/demo-clock";
import { ensureSyntheticAuctionWeek } from "@/lib/synth/ensure-auction-week";

export const maxDuration = 60;

const CONFIRMATION = "RESET SYNTHETIC DEMO";
let resetInFlight: Promise<DemoSeedSummary> | null = null;

const MUTATING_DEMO_TASKS = [
  "label-day",
  "doa-resolution",
  "ship-day-exception",
  "live-tick",
  "reef-chat",
];

async function activeDemoRuns() {
  const page = await runs.list({
    status: ["PENDING_VERSION", "QUEUED", "DEQUEUED", "EXECUTING", "WAITING", "DELAYED"],
    taskIdentifier: MUTATING_DEMO_TASKS,
    period: "1d",
    limit: 100,
  });
  return page.data;
}

async function stopActiveDemoRuns() {
  const active = await activeDemoRuns();
  await Promise.all(active.map((run) => runs.cancel(run.id)));
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await activeDemoRuns()).length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Active demo workflows did not stop before the reset deadline.");
}

function runReset() {
  if (resetInFlight) return resetInFlight;
  resetInFlight = (async () => {
    const operation = await acquireDemoReset(pgPool());
    try {
      await stopActiveDemoRuns();
      const demoHorizon = new Date(demoAuctionMoment("saturday") + 2 * 60_000);
      const analytics = chClient();
      try {
        await ensureSyntheticAuctionWeek(analytics, demoAuctionWeekIndex("saturday"));
      } finally {
        await analytics.close();
      }
      const summary = await resetSyntheticPostgres(operation.client, { now: demoHorizon });
      await stopActiveDemoRuns();
      return summary;
    } finally {
      await operation.release();
    }
  })().finally(() => {
    resetInFlight = null;
  });
  return resetInFlight;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.REEF_DEMO_RESET_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, error: "Demo reset is disabled in this environment." },
      { status: 403 },
    );
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ ok: false, error: "JSON request required." }, { status: 415 });
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: "Same-origin request required." }, { status: 403 });
  }

  try {
    await requireOwner();
  } catch (error) {
    if (error instanceof OwnerAuthError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.reason === "unconfigured" ? 503 : 401 },
      );
    }
    throw error;
  }

  const body = await request.json().catch(() => null) as { confirm?: string } | null;
  if (body?.confirm !== CONFIRMATION) {
    return NextResponse.json(
      { ok: false, error: "Reset confirmation was not accepted." },
      { status: 400 },
    );
  }

  try {
    const summary = await runReset();
    return NextResponse.json(
      { ok: true, summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Synthetic demo reset failed", error);
    return NextResponse.json(
      { ok: false, error: "The synthetic demo could not be restored. No partial reset was saved." },
      { status: 500 },
    );
  }
}
