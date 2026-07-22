import type { ComponentSpec } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, SpecCard } from "./bits";
import { num, usd } from "./format";

type MergeBatchSpec = Extract<ComponentSpec, { kind: "merge_batch" }>;

export function MergeBatch({ spec }: { spec: MergeBatchSpec }) {
  const metrics = [
    ["ELIGIBLE SHIPMENTS", num(spec.candidates)],
    ["TO MERGE", num(spec.readyCandidates)],
    ["SOURCE ORDERS", num(spec.sourceOrders)],
    ["ADD-ON ORDERS", num(spec.addonOrders)],
    ["CORAL UNITS", num(spec.coralUnits)],
  ];

  return (
    <SpecCard
      tag="COMBINED ORDER RUN"
      tone="coral"
      right={(
        <>
          {spec.asOf ? <Chip className="border-line text-mute">{spec.asOf}</Chip> : null}
          <Chip className={spec.readyCandidates ? "border-coral/50 text-coralhi" : "border-ok/50 text-ok"}>
            {spec.readyCandidates ? "READY TO MERGE" : "MERGED · RECONCILED"}
          </Chip>
        </>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="max-w-2xl text-[14px] leading-relaxed text-dim">
            Each ReefnBid auction order is the anchor. Its Shopify or eBay add-ons will join the same eligible shipment.
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-mute">
            {spec.weekLabel} · direct winner-code match · one box per customer
          </p>
        </div>
        <div className="lg:text-right">
          <p className="font-mono text-[10px] tracking-[0.08em] text-mute">COMBINED ORDER VALUE</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-tealhi">
            {usd(spec.totalCents)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-5">
        {metrics.map(([label, value]) => (
          <div key={label} className="bg-raise/70 px-3 py-3">
            <p className="font-mono text-[10px] tracking-[0.08em] text-mute">{label}</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
          </div>
        ))}
      </div>

      <ActionRow actions={spec.actions} />
    </SpecCard>
  );
}
