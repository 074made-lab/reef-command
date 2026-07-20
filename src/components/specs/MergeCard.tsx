/** THE signature component: one customer's orders on different platforms
 *  visibly flow into a single combined shipment — one box, one shipping fee.
 *  Animated phosphor connectors carry the sources into the combined card. */

import type { OrderSummary } from "@/lib/protocol";
import type { ComponentSpec } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, ConfidenceMeter, PlatformChip, SpecCard, TierBadge } from "./bits";
import { usd } from "./format";

type MergeSpec = Extract<ComponentSpec, { kind: "merge_card" }>;

function SourceOrder({ o }: { o: OrderSummary }) {
  return (
    <div className="rounded-sm border border-line bg-raise/50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <PlatformChip p={o.platform} />
          <span className="font-mono text-[11px] text-dim">{o.orderId}</span>
        </span>
        <span className="font-mono text-sm font-semibold text-ink tabular-nums">
          {usd(o.totalCents)}
        </span>
      </div>
      {o.destination ? (
        <p className="mt-0.5 font-mono text-[10px] text-mute">
          → {o.destination}
        </p>
      ) : null}
    </div>
  );
}

/** Curved connectors from each source card converging on the combined card. */
function Connector({ n }: { n: number }) {
  const ys = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * 120);
  return (
    <svg
      viewBox="0 0 64 120"
      preserveAspectRatio="none"
      className="hidden h-full w-full md:block"
      aria-hidden
    >
      {ys.map((y, i) => (
        <path
          key={i}
          d={`M0 ${y} C 30 ${y}, 36 60, 64 60`}
          fill="none"
          stroke="var(--color-teal)"
          strokeWidth="1.5"
          className="merge-flow"
          opacity="0.8"
        />
      ))}
      <circle cx="60" cy="60" r="3" fill="var(--color-tealhi)" />
    </svg>
  );
}

export function MergeCard({ spec }: { spec: MergeSpec }) {
  const { orders, customer, combined, confidence, actions } = spec;
  return (
    <SpecCard tag="MERGE CANDIDATE" right={<ConfidenceMeter level={confidence} />}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">
          {customer.displayName}
        </span>
        <TierBadge tier={customer.tier} />
        {/* tool layer may repeat a platform per order — dedupe for display */}
        {[...new Set(customer.platforms)].map((p) => (
          <PlatformChip key={p} p={p} />
        ))}
        <span className="ml-auto font-mono text-[11px] text-mute">
          {orders.length} orders · {orders.length} shipping fees → 1
        </span>
      </div>

      <div className="grid items-stretch gap-2 md:grid-cols-[1fr_56px_1.15fr] md:gap-0">
        <div className="flex flex-col justify-center gap-2">
          {orders.map((o) => (
            <SourceOrder key={o.orderId} o={o} />
          ))}
        </div>

        <div className="relative min-h-6 md:min-h-0">
          <Connector n={orders.length} />
          <p className="text-center font-mono text-[10px] text-teal md:hidden">
            ▼ merges into ▼
          </p>
        </div>

        <div className="flex flex-col justify-center rounded-sm border border-tealhi/40 bg-teal/[0.06] px-4 py-3 shadow-[0_0_28px_rgba(79,227,207,0.07)]">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <PlatformChip p="combined" />
              <span className="font-mono text-[11px] text-dim">
                {combined.orderId}
              </span>
            </span>
            <Chip className="border-ok/40 text-ok">1 BOX</Chip>
          </div>
          <p className="mt-2 font-mono text-3xl leading-none font-semibold text-tealhi tabular-nums">
            {usd(combined.totalCents)}
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-dim">
            → {combined.destination || "destination on file"}
            <span className="text-mute"> · {combined.shipWeek}</span>
          </p>
          <p className="mt-1 font-mono text-[10px] text-mute">
            one box · one shipping fee · live corals travel together
          </p>
        </div>
      </div>

      <ActionRow actions={actions} />
    </SpecCard>
  );
}
