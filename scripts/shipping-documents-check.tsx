/** Behavioral conservation gate for Monday's shipping-document package. */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pool } from "pg";
import { ShippingDocumentBoard } from "../src/components/specs/ShippingDocumentBoard";
import {
  buildShippingDocumentBoard,
  buildShippingDocumentManifest,
  buildManifest,
  selectShippingLabelPurchase,
} from "../src/lib/label-day";

const rows = [
  {
    id: "701", primary_name: "merged_keeper", tier: 2, items: "3",
    destination: "Denver, CO", platforms: ["auction", "web"],
    order_ids: ["AUC-701", "WEB-701"], shipment_code: "SHP-MERGED-W28",
    shipment_status: "planned",
    has_held_order: false,
    document_key: "shipment:701",
    products: [
      { sku: "RC-A", name: "Torch A", qty: 1 },
      { sku: "RC-B", name: "Zoa B", qty: 2 },
    ],
  },
  {
    id: "702", primary_name: "hold_keeper", tier: 3, items: "2",
    destination: "Portland, OR", platforms: ["auction"],
    order_ids: ["AUC-702"], shipment_code: "SHP-HOLD-W28",
    shipment_status: "voided",
    has_held_order: false,
    document_key: "shipment:702",
    products: [{ sku: "RC-C", name: "Goni C", qty: 2 }],
  },
  {
    id: "702", primary_name: "hold_keeper", tier: 3, items: "1",
    destination: "Portland, OR", platforms: ["web"],
    order_ids: ["WEB-702-A"], shipment_code: null,
    shipment_status: null,
    has_held_order: true,
    document_key: "held-order:9001",
    products: [{ sku: "RC-D", name: "Zoa D", qty: 1 }],
  },
  {
    id: "702", primary_name: "hold_keeper", tier: 3, items: "1",
    destination: "Portland, OR", platforms: ["ebay"],
    order_ids: ["EBAY-702-B"], shipment_code: null,
    shipment_status: null,
    has_held_order: true,
    document_key: "held-order:9002",
    products: [{ sku: "RC-E", name: "Hammer E", qty: 1 }],
  },
];

class FakePool {
  sql = "";
  params: unknown[] = [];
  async query(sql: string, params: unknown[] = []) {
    this.sql = sql;
    this.params = params;
    return { rows };
  }
}

async function main() {
const fake = new FakePool();
const pg = fake as unknown as Pool;
const manifest = await buildShippingDocumentManifest(pg);

assert.equal(manifest.documentShipments.length, 4);
assert.equal(manifest.productLabels, 7, "one physical coral must produce one bag label");
assert.equal(manifest.documentShipments[0]?.shipmentId, "SHP-MERGED-W28",
  "an existing merged shipment code must survive document generation");
assert.equal(manifest.documentShipments[0]?.productLabels.length, 3);
assert.equal(manifest.documentShipments[1]?.carrierLabel, "withheld",
  "a voided shipment must fail closed even before its orders finish moving to held");
assert.equal(manifest.documentShipments[1]?.productLabels.length, 2);
assert.equal(new Set(manifest.documentShipments.map((shipment) => shipment.shipmentId)).size, 4,
  "separate unlinked held orders for one customer must receive unique synthetic shipment ids");
assert.ok(manifest.documentShipments.slice(2).every((shipment) => shipment.carrierLabel === "withheld"),
  "unlinked held orders must never receive carrier previews");
assert.match(fake.sql, /planned_target[\s\S]*ship_week = \$1/,
  "current-week planned shipments must be reused");
assert.match(fake.sql, /active_shipment\.status IN \('planned','purchased','held','voided'\)/,
  "linked active and voided hold shipments must remain in the document set");
assert.match(fake.sql, /bool_or\(document_orders\.status = 'held'\) AS has_held_order/,
  "the real held-order lifecycle must drive carrier withholding");
assert.match(fake.sql, /o\.status = 'held' AND o\.shipment_id IS NULL[\s\S]*THEN NULL/,
  "an unlinked held order must not fold into an unrelated planned shipment");
assert.match(fake.sql, /sum\(CASE WHEN oi\.id IS NULL THEN 1 ELSE oi\.qty END\)/,
  "itemless orders must contribute a fallback coral label inside mixed groups");
assert.deepEqual(fake.params, [manifest.weekLabel]);

const purchaseFake = new FakePool();
await buildManifest(purchaseFake as unknown as Pool);
assert.match(purchaseFake.sql, /o\.status IN \('pending','paid'\) AND o\.shipment_id IS NULL/,
  "money-gated purchase payload must exclude held, purchased, and already-linked orders");
assert.doesNotMatch(purchaseFake.sql, /o\.status IN \('pending','paid','labeled','held'\)/,
  "the broader document read model must never leak into the purchase payload");

const fakeForBoard = new FakePool();
const specs = await buildShippingDocumentBoard(fakeForBoard as unknown as Pool);
const spec = specs[0];
assert.equal(spec?.kind, "shipping_document_board");
if (!spec || spec.kind !== "shipping_document_board") throw new Error("wrong document spec");
assert.equal(spec.packingSlips, 4);
assert.equal(spec.fedexLabels, 1, "held shipment must not claim a FedEx document");
assert.equal(spec.productLabels, 7);
assert.equal(spec.actions?.length, 1, "a ready carrier preview must expose one owner-gated purchase action");
assert.equal(spec.actions?.[0]?.taskId, "purchase-shipping-labels");
assert.match(spec.actions?.[0]?.label ?? "", /PURCHASE 1 FEDEX LABEL/);
assert.equal(spec.purchaseCostCents, manifest.shipments[0]?.costCents);

const approved = selectShippingLabelPurchase(manifest, [{
  shipmentId: "SHP-MERGED-W28",
  orderIds: ["AUC-701", "WEB-701"],
}]);
assert.equal(approved.shipments.length, 1);
assert.equal(approved.documentShipments[0]?.carrierLabel, "preview");
assert.throws(() => selectShippingLabelPurchase(manifest, [{
  shipmentId: "SHP-HOLD-W28",
  orderIds: ["AUC-702"],
}]), /no longer purchase-ready/, "held or voided documents must never enter purchase");
assert.throws(() => selectShippingLabelPurchase(manifest, [{
  shipmentId: "SHP-MERGED-W28",
  orderIds: ["AUC-701"],
}]), /changed after document review/, "a changed order set must invalidate approval");

const html = renderToStaticMarkup(<ShippingDocumentBoard spec={spec} />);
const count = (needle: string) => html.split(needle).length - 1;
assert.equal(count("data-print-packing-slip="), spec.packingSlips,
  "print package must contain every reported packing slip");
assert.equal(count("data-print-fedex-label="), spec.fedexLabels,
  "print package must contain every eligible FedEx label or preview");
assert.equal(count("data-print-product-label="), spec.productLabels,
  "print package must contain one label per physical coral bag");

console.log("✓ merged planned shipments remain in Monday documents");
console.log("✓ voided and held shipments print coral labels and fail closed on FedEx");
console.log("✓ separate holds for one customer keep unique document identifiers");
console.log("✓ printed slip, FedEx, and bag-label nodes conserve displayed counts");
console.log("✓ the owner-gated purchase action binds the exact reviewed preview set");
console.log("\nALL PASS — Monday shipping-document conservation");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
