"use client";

import { useState } from "react";
import type { ComponentSpec, ShipmentCommandIssue } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, SpecCard, StatusChip } from "./bits";

type ShipmentCommandSpec = Extract<ComponentSpec, { kind: "shipment_command_board" }>;

const ISSUE_LABEL: Record<ShipmentCommandIssue["kind"], string> = {
  doa: "DOA",
  customer_question: "CUSTOMER",
  address_change: "ADDRESS",
  weather: "PACK CHECK",
  carrier_delay: "DELAY",
  delivery_exception: "EXCEPTION",
  stalled: "NO MOVEMENT",
};

export function ShipmentCommandBoard({ spec }: { spec: ShipmentCommandSpec }) {
  const [resolved, setResolved] = useState<Set<string>>(() => new Set());
  const openIssues = spec.issues.filter((issue) => !resolved.has(issue.id));
  const urgent = openIssues.filter((issue) => issue.severity === "urgent").length;
  const ready = spec.shipments.filter((shipment) =>
    shipment.status === "ready" || shipment.blockerIds.every((id) => resolved.has(id))).length;

  return (
    <SpecCard
      tag={spec.mode === "ship" ? "SHIP-DAY COMMAND" : "OVERNIGHT WATCH"}
      tone={urgent ? "coral" : "teal"}
      right={<Chip className={urgent ? "border-coral/45 text-coralhi" : "border-ok/45 text-ok"}>{spec.asOf}</Chip>}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <div>
          <p className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{spec.title}</p>
          <p className="mt-1 text-[13px] text-dim">{spec.shipDate} · {spec.carrierCutoff}</p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg bg-abyss/45">
          {[
            [spec.shipments.length, spec.mode === "ship" ? "SHIP TODAY" : "TRACKED"],
            [ready, spec.mode === "ship" ? "READY" : "CLEAR"],
            [openIssues.length, "OPEN"],
          ].map(([value, label], index) => (
            <div key={String(label)} className={`px-3 py-2.5 ${index ? "border-l border-line/60" : ""}`}>
              <p className={`font-mono text-[20px] font-semibold tabular-nums ${label === "OPEN" && openIssues.length ? "text-coralhi" : "text-tealhi"}`}>{value}</p>
              <p className="mt-0.5 font-mono text-[9px] tracking-[0.08em] text-mute">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[12px] font-semibold tracking-[0.07em] text-ink uppercase">Exception queue</h3>
          <span className={`font-mono text-[11px] ${openIssues.length ? "text-warn" : "text-ok"}`}>
            {openIssues.length ? `${openIssues.length} need action` : "✓ all cleared"}
          </span>
        </div>
        <div className="mt-2 divide-y divide-line/55 overflow-hidden rounded-lg bg-raise/45">
          {spec.issues.map((issue) => {
            const done = resolved.has(issue.id);
            return (
              <article key={issue.id} className={`p-3.5 transition-colors ${done ? "bg-ok/[0.035]" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip className={issue.severity === "urgent" && !done ? "border-coral/45 text-coralhi" : "border-line text-mute"}>
                    {done ? "CLEARED" : ISSUE_LABEL[issue.kind]}
                  </Chip>
                  <span className="font-mono text-[10px] text-mute">{issue.detectedAt}</span>
                  <span className="ml-auto font-mono text-[10px] text-dim">{issue.orderId} · {issue.shipmentId}</span>
                </div>
                <h4 className="mt-2 text-[14px] font-semibold leading-snug text-ink">{issue.headline}</h4>
                <p className="mt-1 text-[12px] leading-relaxed text-dim">{issue.whyBlocked}</p>
                {issue.currentValue ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-danger/[0.055] px-3 py-2">
                      <p className="font-mono text-[9px] tracking-[0.07em] text-danger">CURRENT / BLOCKED</p>
                      <p className="mt-1 text-[12px] text-ink">{issue.currentValue}</p>
                    </div>
                    <div className="rounded-md bg-ok/[0.055] px-3 py-2">
                      <p className="font-mono text-[9px] tracking-[0.07em] text-ok">RECOMMENDED</p>
                      <p className="mt-1 text-[12px] text-ink">{issue.recommendation}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 border-l border-teal/35 pl-2.5 text-[12px] leading-relaxed text-tealhi">{issue.recommendation}</p>
                )}
                {!done ? (
                  <ActionRow actions={issue.actions} onComplete={() => setResolved((current) => new Set(current).add(issue.id))} />
                ) : (
                  <p className="mt-2 font-mono text-[10px] text-ok">✓ ACTION RECORDED · synthetic demo state</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[12px] font-semibold tracking-[0.07em] text-ink uppercase">
              {spec.mode === "ship" ? "Complete ship-today manifest" : "Shipment watch list"}
            </h3>
            <p className="mt-0.5 text-[11px] text-mute">Order, shipment, tracking, destination, pack, and handoff stay joined.</p>
          </div>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border border-line/60">
          <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
            <thead className="bg-raise/70 font-mono text-[9px] tracking-[0.07em] text-mute">
              <tr>
                <th className="px-3 py-2.5">CUSTOMER / ORDER</th>
                <th className="px-3 py-2.5">SHIPMENT / TRACKING</th>
                <th className="px-3 py-2.5">DESTINATION</th>
                <th className="px-3 py-2.5">CORALS / PACK</th>
                <th className="px-3 py-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/45">
              {spec.shipments.map((shipment) => {
                const cleared = shipment.blockerIds.length > 0 && shipment.blockerIds.every((id) => resolved.has(id));
                const status = cleared ? "ready" : shipment.status;
                return (
                  <tr key={shipment.shipmentId} className="bg-panel/25 transition-colors hover:bg-teal/[0.035]">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink">{shipment.customer}</p>
                      <p className="font-mono text-[10px] text-mute">{shipment.orderId}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">
                      <p className="text-ink">{shipment.shipmentId}</p>
                      <p className="text-[10px] text-mute">{shipment.tracking}</p>
                    </td>
                    <td className="px-3 py-2.5 text-dim">{shipment.destination}</td>
                    <td className="px-3 py-2.5 font-mono text-dim">{shipment.coralUnits} · {shipment.pack}</td>
                    <td className="px-3 py-2.5"><StatusChip s={status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </SpecCard>
  );
}
