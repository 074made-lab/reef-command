"use client";

import type { ComponentSpec, ShippingDocumentShipment } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";
import { num } from "./format";

type DocumentSpec = Extract<ComponentSpec, { kind: "shipping_document_board" }>;

function PackChip({ pack }: { pack: ShippingDocumentShipment["pack"] }) {
  const tone = pack === "heat"
    ? "border-coral/45 bg-coral/[0.06] text-coralhi"
    : pack === "ice"
      ? "border-tealhi/45 bg-teal/[0.06] text-tealhi"
      : "border-line text-mute";
  return <Chip className={tone}>{pack === "none" ? "NO PACK" : `${pack.toUpperCase()} PACK`}</Chip>;
}

function PackingSlipMini({ shipment }: { shipment?: ShippingDocumentShipment }) {
  return (
    <div className="min-h-44 rounded-sm border border-line bg-[#f2eee7] p-3 text-[#102027] shadow-[0_8px_24px_rgba(0,0,0,.22)]">
      <div className="flex items-start justify-between gap-2 border-b border-[#a6b0ae] pb-2">
        <div><p className="text-[11px] font-bold tracking-[0.12em]">TIA CORAL</p><p className="text-[8px] tracking-[0.1em]">PACKING SLIP</p></div>
        <span className="rounded border border-[#677574] px-1.5 py-0.5 font-mono text-[8px]">NO PRICES</span>
      </div>
      <dl className="mt-2 grid grid-cols-[42px_1fr] gap-x-2 gap-y-1 font-mono text-[8px] leading-tight">
        <dt className="text-[#647270]">SHIP TO</dt><dd className="font-semibold">{shipment?.customer.displayName ?? "No ready shipment"}</dd>
        <dt className="text-[#647270]">CITY</dt><dd>{shipment?.destination ?? "—"}</dd>
        <dt className="text-[#647270]">ORDERS</dt><dd className="break-all">{shipment?.orderIds.join(" + ") ?? "—"}</dd>
      </dl>
      <div className="mt-3 border-y border-[#a6b0ae] py-2 font-mono text-[8px]">
        <div className="flex justify-between"><span>CORAL BAGS</span><strong>{shipment?.coralUnits ?? 0}</strong></div>
        <div className="mt-1 flex justify-between"><span>BOX</span><strong>{shipment ? `${shipment.boxSize} · ${shipment.boxDimensions}` : "—"}</strong></div>
      </div>
      <p className="mt-2 text-[8px] font-semibold">□ Verify every bag label against this slip</p>
    </div>
  );
}

function FedexMini({ shipment }: { shipment?: ShippingDocumentShipment }) {
  const purchased = shipment?.carrierLabel === "purchased";
  return (
    <div className="min-h-44 rounded-sm border border-line bg-white p-3 text-[#171717] shadow-[0_8px_24px_rgba(0,0,0,.22)]">
      <div className="flex items-center justify-between border-b-2 border-black pb-1.5">
        <span className="text-[18px] font-extrabold tracking-[-0.08em]"><span className="text-[#4d148c]">Fed</span><span className="text-[#ff6600]">Ex</span></span>
        <span className="font-mono text-[8px] font-bold">PRIORITY OVERNIGHT</span>
      </div>
      <div className="mt-2 flex justify-between gap-2 font-mono text-[8px]">
        <div><p className="text-[7px] text-[#666]">SHIP TO</p><p className="font-bold">{shipment?.customer.displayName ?? "NO SHIPMENT"}</p><p>{shipment?.destination ?? "—"}</p></div>
        <div className="text-right"><p>{shipment?.weightLb ?? 0} LB</p><p>{shipment?.boxDimensions ?? "—"}</p></div>
      </div>
      <div className="mt-3 border-2 border-black px-2 py-1 text-center font-mono">
        <p className="text-[7px] font-bold tracking-[0.14em]">{purchased ? "SYNTHETIC LABEL RECORD" : "SYNTHETIC PREVIEW"}</p>
        <p className="mt-0.5 text-[16px] font-black tracking-[0.2em]">{purchased ? "PURCHASED" : "NOT PURCHASED"}</p>
      </div>
      <div className="mt-3 h-7 bg-[repeating-linear-gradient(90deg,#111_0,#111_2px,transparent_2px,transparent_4px,#111_4px,#111_5px,transparent_5px,transparent_8px)]" />
      <p className="mt-1 text-center font-mono text-[7px] tracking-[0.2em]">DEMO · {shipment?.shipmentId ?? "—"}</p>
    </div>
  );
}

function ProductLabelMini({ shipment, label }: {
  shipment?: ShippingDocumentShipment;
  label?: ShippingDocumentShipment["productLabels"][number];
}) {
  const example = label ?? shipment?.productLabels[0];
  return (
    <div className="flex min-h-44 items-center justify-center rounded-sm border border-line bg-[radial-gradient(circle_at_50%_35%,rgba(130,212,202,.15),transparent_45%),#071219] p-3 shadow-[0_8px_24px_rgba(0,0,0,.22)]">
      <div className="w-full max-w-48 rounded-lg border-2 border-dashed border-coral/60 bg-panel px-3 py-3 text-center shadow-[0_0_0_3px_rgba(255,133,89,.08)]">
        <p className="text-[9px] font-bold tracking-[0.18em] text-coralhi">TIA CORAL · BAG LABEL</p>
        <p className="mt-2 text-[13px] font-semibold leading-tight text-ink">{example?.name ?? "No coral label"}</p>
        <p className="mt-1 font-mono text-[9px] text-tealhi">{example?.sku ?? "—"}</p>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-2 font-mono text-[8px] text-dim">
          <span>{shipment?.shipmentId ?? "—"}</span><strong className="text-coralhi">{example?.bag ?? "0 OF 0"}</strong>
        </div>
      </div>
    </div>
  );
}

function CarrierWithheld({ shipment }: { shipment: ShippingDocumentShipment }) {
  return (
    <div className="grid min-h-44 place-items-center rounded-sm border-2 border-dashed border-warn/55 bg-warn/[0.04] p-4 text-center">
      <div>
        <p className="font-mono text-[10px] tracking-[0.14em] text-warn">CARRIER LABEL WITHHELD</p>
        <p className="mt-2 text-[14px] font-semibold text-ink">{shipment.shipmentId}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-dim">Print bag labels into the HOLD folder. Do not purchase or attach a FedEx label.</p>
      </div>
    </div>
  );
}

function PrintDocumentPackage({ spec }: { spec: DocumentSpec }) {
  return (
    <div className="print-only" aria-hidden="true">
      {spec.shipments.map((shipment) => (
        <article key={shipment.shipmentId} className="print-sheet">
          <header className="mb-4 border-b-2 border-black pb-2 text-black">
            <p className="text-[11px] font-bold tracking-[0.16em]">TIA CORAL · MONDAY DOCUMENT SET</p>
            <p className="mt-1 font-mono text-[9px]">{shipment.shipmentId} · {shipment.orderIds.join(" + ")} · {spec.asOf}</p>
          </header>
          <div className="grid grid-cols-2 gap-4">
            <div data-print-packing-slip={shipment.shipmentId}><PackingSlipMini shipment={shipment} /></div>
            {shipment.carrierLabel === "withheld" ? (
              <CarrierWithheld shipment={shipment} />
            ) : (
              <div data-print-fedex-label={shipment.shipmentId}><FedexMini shipment={shipment} /></div>
            )}
          </div>
          <div className="mt-4 border-t border-black pt-3">
            <div className="mb-2 flex items-center justify-between text-black">
              <p className="text-[10px] font-bold tracking-[0.12em]">ONE PRODUCT LABEL PER CORAL BAG</p>
              <p className="font-mono text-[9px]">{shipment.productLabels.length} LABELS · {shipment.carrierLabel === "withheld" ? "HOLD FOLDER" : shipment.boxSize + " BOX"}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {shipment.productLabels.map((label) => (
                <div key={`${shipment.shipmentId}-${label.bag}-${label.sku}`} data-print-product-label={`${shipment.shipmentId}-${label.bag}`}>
                  <ProductLabelMini shipment={shipment} label={label} />
                </div>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function ShippingDocumentBoard({ spec }: { spec: DocumentSpec }) {
  const example = spec.shipments[0];
  const printBoard = () => window.print();

  return (
    <div className="shipping-print-board">
      <div className="screen-only">
      <SpecCard
        tag="MONDAY SHIPPING DOCUMENTS"
        tone="coral"
        right={<Chip className="border-coral/45 text-coralhi">{spec.asOf}</Chip>}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[18px] font-semibold tracking-[-0.02em] text-ink">Print set prepared for the packing team</p>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-dim">{spec.printNote}</p>
          </div>
          <button
            type="button"
            onClick={printBoard}
            disabled={!spec.shipments.length}
            className="no-print rounded-md border border-coral/60 bg-coral/10 px-3 py-2 font-mono text-[12px] font-semibold tracking-[0.04em] text-coralhi transition-colors hover:bg-coral/20 disabled:opacity-40"
          >
            PRINT DOCUMENT SET
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          {[
            ["PACKING SLIPS", num(spec.packingSlips), "READY"],
            ["FEDEX LABELS", num(spec.fedexLabels), "READY · GATED"],
            ["BAG LABELS", num(spec.productLabels), "1 PER CORAL"],
            ["SHIPMENTS", num(spec.shipments.length), spec.weekLabel],
          ].map(([label, value, note]) => (
            <div key={label} className="bg-raise/70 px-3 py-3">
              <p className="font-mono text-[9px] tracking-[0.08em] text-mute">{label}</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
              <p className="mt-0.5 font-mono text-[9px] tracking-[0.06em] text-tealhi">{note}</p>
            </div>
          ))}
        </div>

        <section className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">Miniature print examples</h3>
            <span className="font-mono text-[10px] text-mute">FIRST READY SHIPMENT · SCALE PREVIEW</span>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div><p className="mb-1.5 font-mono text-[10px] text-mute">PACKING SLIP</p><PackingSlipMini shipment={example} /></div>
            <div>
              <p className="mb-1.5 font-mono text-[10px] text-mute">FEDEX LABEL</p>
              {example?.carrierLabel === "withheld"
                ? <CarrierWithheld shipment={example} />
                : <FedexMini shipment={example} />}
            </div>
            <div><p className="mb-1.5 font-mono text-[10px] text-mute">CORAL BAG LABEL</p><ProductLabelMini shipment={example} /></div>
          </div>
        </section>

        <section className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">Packing board</h3>
              <p className="mt-1 text-[12px] text-dim">Weather verdict, pack type, box size, weight floor, and document counts stay on one line per shipment.</p>
            </div>
            <Chip className="border-ok/35 text-ok">✓ WEATHER CHECKED</Chip>
          </div>
          <div className="mt-2 overflow-x-auto rounded-sm border border-line/70">
            <table className="w-full min-w-[820px] border-collapse text-[12px]">
              <thead>
                <tr className="bg-raise/70">
                  {['shipment / orders', 'corals', 'destination weather', 'pack', 'box', 'weight', 'documents'].map((heading) => (
                    <th key={heading} className="border-b border-line px-2.5 py-2 text-left font-mono text-[10px] font-medium tracking-[0.07em] text-mute uppercase">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spec.shipments.map((shipment) => (
                  <tr key={shipment.shipmentId} className="border-b border-line/45 last:border-0">
                    <td className="px-2.5 py-2">
                      <p className="font-mono text-[11px] text-ink">{shipment.shipmentId}</p>
                      <p className="mt-0.5 max-w-64 break-words font-mono text-[9px] leading-snug text-mute">{shipment.orderIds.join(" + ")}</p>
                    </td>
                    <td className="px-2.5 py-2 font-mono tabular-nums text-ink">{shipment.coralUnits}<span className="ml-1 text-[9px] text-mute">labels</span></td>
                    <td className="px-2.5 py-2"><p className="text-ink">{shipment.destination}</p><p className="font-mono text-[10px] text-mute">{shipment.lowF}–{shipment.highF}°F</p></td>
                    <td className="px-2.5 py-2"><PackChip pack={shipment.pack} /></td>
                    <td className="px-2.5 py-2"><p className="font-mono text-ink">{shipment.boxSize}</p><p className="font-mono text-[9px] text-mute">{shipment.boxDimensions}</p></td>
                    <td className="px-2.5 py-2 font-mono tabular-nums text-dim">{shipment.weightLb} lb</td>
                    <td className="px-2.5 py-2 font-mono text-[9px] leading-relaxed text-ok">✓ slip<br />{shipment.carrierLabel === "withheld" ? <span className="text-warn">○ FedEx withheld</span> : <>✓ FedEx {shipment.carrierLabel}</>}<br />✓ {shipment.productLabels.length} bag labels</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-3 grid gap-2 rounded-md border border-warn/30 bg-warn/[0.035] p-3 text-[12px] leading-relaxed sm:grid-cols-2">
          <p><strong className="text-warn">HOLD RULE:</strong> product labels still print and move to the physical HOLD folder. No carrier label is purchased for a held order.</p>
          <p><strong className="text-warn">OWNER GATE:</strong> FedEx previews require separate owner approval. Held shipments never enter the carrier purchase queue.</p>
        </div>
      </SpecCard>
      </div>
      <PrintDocumentPackage spec={spec} />
    </div>
  );
}
