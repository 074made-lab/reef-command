/**
 * Fault-injection gate for purchaseLabels' recoverable idempotency (Codex R3-P1).
 *
 * Reproduces the exact failure injections Codex ran — order-link failure then
 * replay, ClickHouse failure then replay — plus a normal replay and a
 * double-replay, using in-memory fakes so it is deterministic and never touches
 * the live stores or mutates the demo world. Each scenario asserts the invariant
 * that broke before the fix: after a partial failure + a replay of the SAME
 * manifest, the shipment ends 'purchased', its orders are linked, and EXACTLY
 * ONE label_purchased event exists — no permanent gap, no double count.
 *
 * Run: npx tsx scripts/labelday-recovery-check.ts   (no env, no network)
 */
import { purchaseLabels, type Manifest } from "../src/lib/label-day";

// ---- in-memory Postgres double (pattern-matches only the SQL this path runs)
class FakePg {
  shipments = new Map<string, { id: string; status: string; purchasedAt: string | null }>();
  orders: { externalId: string; customerId: number; shipmentId: string | null; status: string }[] = [];
  failLinkOnce = false;
  private seq = 1;

  async query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    if (sql.includes("SELECT o.external_id, o.status")) {
      const [cust, ids] = params as [number, string[]];
      const rows = this.orders
        .filter((order) => order.customerId === cust && ids.includes(order.externalId))
        .sort((a, b) => a.externalId.localeCompare(b.externalId))
        .map((order) => {
          const linked = order.shipmentId === null
            ? undefined
            : [...this.shipments.entries()].find(([, shipment]) => shipment.id === order.shipmentId);
          return {
            external_id: order.externalId,
            status: order.status,
            shipment_code: linked?.[0] ?? null,
            shipment_status: linked?.[1].status ?? null,
          };
        });
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("INSERT INTO shipments")) {
      const code = params[0] as string;
      if (!this.shipments.has(code)) this.shipments.set(code, { id: String(this.seq++), status: "planned", purchasedAt: null });
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("SELECT id, status FROM shipments")) {
      const s = this.shipments.get(params[0] as string);
      return { rows: s ? [{ id: s.id, status: s.status }] : [], rowCount: s ? 1 : 0 };
    }
    if (sql.includes("UPDATE orders SET shipment_id")) {
      if (this.failLinkOnce) { this.failLinkOnce = false; throw new Error("injected: order link failed"); }
      const [pk, cust, ids] = params as [string, number, string[]];
      for (const o of this.orders)
        if (o.customerId === cust && ids.includes(o.externalId) && o.shipmentId === null) { o.shipmentId = pk; o.status = "labeled"; }
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("UPDATE shipments SET status = 'purchased'")) {
      const [pk, now] = params as [string, string];
      for (const s of this.shipments.values()) if (s.id === pk && s.status !== "purchased") { s.status = "purchased"; s.purchasedAt = now; }
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`unexpected SQL in fake pg: ${sql.slice(0, 60)}`);
  }
}

// ---- in-memory ClickHouse double. `down` models an unreachable service.
class FakeCh {
  events: { type: string; order_id: string }[] = [];
  down = false;
  async query({ query, query_params }: { query: string; query_params?: Record<string, unknown> }) {
    if (this.down) throw new Error("injected: ClickHouse query unreachable");
    if (query.includes("count() AS n")) {
      const sid = query_params?.sid as string;
      const n = this.events.filter((e) => e.type === "label_purchased" && e.order_id === sid).length;
      return { json: async () => [{ n: String(n) }] };
    }
    return { json: async () => [] };
  }
  async insert({ values }: { values: { type: string; order_id: string }[] }) {
    if (this.down) throw new Error("injected: ClickHouse insert unreachable");
    this.events.push(...values);
  }
  async close() {}
}

function manifest(): Manifest {
  const shipmentId = "SHP-101-30";
  return {
    weekLabel: "W30",
    shipments: [{
      shipmentId,
      customer: { customerId: 101, displayName: "Test Customer", tier: 2, platforms: ["web", "auction"] },
      orderIds: ["WEB-1", "AUC-2"], items: 3, weightLb: 3.4, destination: "Denver",
      pack: "none", costCents: 2400, status: "planned",
    }],
    weatherFlags: [], productLabels: 3, totalCostCents: 2400,
    documentShipments: [],
    orderIdsByShipment: { [shipmentId]: ["WEB-1", "AUC-2"] },
  };
}

function freshPg(): FakePg {
  const pg = new FakePg();
  pg.orders = [
    { externalId: "WEB-1", customerId: 101, shipmentId: null, status: "paid" },
    { externalId: "AUC-2", customerId: 101, shipmentId: null, status: "paid" },
  ];
  return pg;
}

const P = (pg: FakePg) => pg as unknown as Parameters<typeof purchaseLabels>[0];
const C = (ch: FakeCh) => ch as unknown as Parameters<typeof purchaseLabels>[1];

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function assert(name: string, cond: boolean, detail: string) { results.push({ name, ok: cond, detail }); }

async function main() {
  // A — normal, then a redundant replay: one event, purchased, replay adds nothing.
  {
    const pg = freshPg(), ch = new FakeCh();
    const r1 = await purchaseLabels(P(pg), C(ch), manifest());
    const r2 = await purchaseLabels(P(pg), C(ch), manifest()); // idempotent replay
    const ship = pg.shipments.get("SHP-101-30");
    assert("A normal+replay", r1.purchased === 1 && r2.purchased === 1 && ch.events.length === 1 && ship?.status === "purchased"
      && pg.orders.every((o) => o.shipmentId !== null),
      `r1=${r1.purchased} r2=${r2.purchased} events=${ch.events.length} status=${ship?.status}`);
  }

  // B — order-link throws on the first pass, then a replay of the same manifest.
  {
    const pg = freshPg(), ch = new FakeCh();
    pg.failLinkOnce = true;
    let threw = false;
    try { await purchaseLabels(P(pg), C(ch), manifest()); } catch { threw = true; }
    const afterFail = pg.shipments.get("SHP-101-30")?.status; // snapshot BEFORE replay mutates the row
    const r2 = await purchaseLabels(P(pg), C(ch), manifest()); // resume
    const ship = pg.shipments.get("SHP-101-30");
    assert("B order-link fail→replay", threw && afterFail === "planned" && r2.purchased === 1
      && ch.events.length === 1 && ship?.status === "purchased" && pg.orders.every((o) => o.shipmentId !== null),
      `threw=${threw} afterFail=${afterFail} r2=${r2.purchased} events=${ch.events.length} final=${ship?.status}`);
  }

  // C — ClickHouse fully down on the first pass, then a replay once it's back.
  {
    const pg = freshPg(), ch = new FakeCh();
    ch.down = true;
    let threw = false;
    try { await purchaseLabels(P(pg), C(ch), manifest()); } catch { threw = true; }
    const afterFail = pg.shipments.get("SHP-101-30")?.status; // snapshot BEFORE replay mutates the row
    ch.down = false;
    const r2 = await purchaseLabels(P(pg), C(ch), manifest()); // resume — must backfill the event
    const ship = pg.shipments.get("SHP-101-30");
    assert("C clickhouse fail→replay", threw && afterFail === "planned" && r2.purchased === 1
      && ch.events.length === 1 && ship?.status === "purchased",
      `threw=${threw} afterFail=${afterFail} r2=${r2.purchased} events=${ch.events.length} final=${ship?.status}`);
  }

  // D — the ack-was-lost case: event already in ClickHouse but the row is still
  //     'planned'. Replay must NOT re-emit (dedup), just finish the commit.
  {
    const pg = freshPg(), ch = new FakeCh();
    ch.events.push({ type: "label_purchased", order_id: "SHP-101-30" }); // pretend a prior emit landed
    pg.shipments.set("SHP-101-30", { id: "1", status: "planned", purchasedAt: null });
    const r = await purchaseLabels(P(pg), C(ch), manifest());
    const ship = pg.shipments.get("SHP-101-30");
    assert("D lost-ack dedup", r.purchased === 1 && ch.events.length === 1 && ship?.status === "purchased",
      `r=${r.purchased} events=${ch.events.length} final=${ship?.status}`);
  }

  // E — the owner reviewed a preview, then an order moved to HOLD before the
  //     Trigger write. Fail closed: the recoverable claim remains planned and
  //     no ClickHouse purchase event or purchased commit lands.
  {
    const pg = freshPg(), ch = new FakeCh();
    pg.orders[0].status = "held";
    let threw = false;
    try { await purchaseLabels(P(pg), C(ch), manifest()); } catch { threw = true; }
    const ship = pg.shipments.get("SHP-101-30");
    assert("E hold-after-review", threw && ship?.status === "planned" && ch.events.length === 0,
      `threw=${threw} status=${ship?.status} events=${ch.events.length}`);
  }

  let failures = 0;
  for (const r of results) {
    console.log(`${r.ok ? "✓ pass" : "✗ FAIL"}  ${r.name}`);
    console.log(`        ${r.detail}`);
    if (!r.ok) failures++;
  }
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} — ${results.length} scenarios`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
