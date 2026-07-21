/** Label-day manifest: shipments with weights, packs, cost — the batch the
 *  merchant approves with one click (money leaves here, so it's gated). */

import type { ComponentSpec } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, SpecCard, StatusChip } from "./bits";
import { num, usd } from "./format";

type ManifestSpec = Extract<ComponentSpec, { kind: "label_manifest" }>;

function PackChip({ pack }: { pack: "none" | "heat" | "cold" }) {
  if (pack === "none") return <span className="text-mute">—</span>;
  return (
    <Chip
      className={
        pack === "heat" ? "border-coral/50 text-coralhi" : "border-tealhi/50 text-tealhi"
      }
    >
      {pack.toUpperCase()}
    </Chip>
  );
}

export function LabelManifest({ spec }: { spec: ManifestSpec }) {
  const { weekLabel, shipments, productLabels, weatherFlags, totalCostCents, actions } = spec;
  const combined = shipments.filter((s) => s.orderIds.length >= 2).length;
  return (
    <SpecCard
      tag="LABEL MANIFEST"
      right={<Chip className="border-tealhi/50 text-tealhi">{weekLabel}</Chip>}
    >
      <div className="flex flex-wrap gap-2">
        <Chip>{num(shipments.length)} shipments</Chip>
        <Chip>{num(combined)} combined</Chip>
        <Chip>{num(productLabels)} product labels</Chip>
        <Chip className="border-coral/50 text-coralhi">
          total {usd(totalCostCents)}
        </Chip>
      </div>

      {weatherFlags.length ? (
        <ul className="mt-3 space-y-1.5 rounded-sm border border-warn/30 bg-warn/[0.04] px-3 py-2">
          {weatherFlags.map((f) => (
            <li key={f.shipmentId} className="flex flex-wrap items-center gap-2 text-[13px]">
              <PackChip pack={f.pack} />
              <span className="text-ink">{f.destination}</span>
              <span className="font-mono text-[12px] text-mute tabular-nums">
                {f.lowF}–{f.highF}°F
              </span>
              <span className="text-dim">{f.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-sm border border-line/60">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-raise/70">
              {["shipment", "customer", "orders", "corals", "lb", "destination", "pack", "cost", "status"].map((h) => (
                <th
                  key={h}
                  className="border-b border-line px-2.5 py-1.5 text-left font-mono text-[12px] font-medium tracking-wider whitespace-nowrap text-mute uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => (
              <tr key={s.shipmentId} className="border-b border-line/40 last:border-0">
                <td className="px-2.5 py-1.5 font-mono text-[12px] whitespace-nowrap text-dim">
                  {s.shipmentId}
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap text-ink">
                  {s.customer.displayName}
                </td>
                <td className="px-2.5 py-1.5 font-mono text-[12px] whitespace-nowrap text-dim">
                  {s.orderIds.join(" + ")}
                </td>
                <td className="px-2.5 py-1.5 text-right font-mono text-dim tabular-nums">
                  {s.items}
                </td>
                <td className="px-2.5 py-1.5 text-right font-mono text-dim tabular-nums">
                  {s.weightLb}
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap text-dim">{s.destination}</td>
                <td className="px-2.5 py-1.5"><PackChip pack={s.pack} /></td>
                <td className="px-2.5 py-1.5 text-right font-mono text-tealhi tabular-nums">
                  {usd(s.costCents)}
                </td>
                <td className="px-2.5 py-1.5"><StatusChip s={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ActionRow actions={actions} />
    </SpecCard>
  );
}
