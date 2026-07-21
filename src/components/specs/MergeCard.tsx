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

/** Layered water currents from each platform converging on the combined box. */
function Connector({ n }: { n: number }) {
  const ys = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * 120);
  return (
    <svg
      viewBox="0 0 92 120"
      preserveAspectRatio="none"
      className="hidden h-full w-full sm:block"
      aria-hidden
    >
      <defs>
        <linearGradient id="mergeCurrent" x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-teal)" stopOpacity="0.18" />
          <stop offset="0.7" stopColor="var(--color-tealhi)" stopOpacity="0.42" />
          <stop offset="1" stopColor="var(--color-coralhi)" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {ys.map((y, i) => (
        <g key={i}>
          <path d={`M-2 ${y} C 30 ${y}, 48 60, 92 60`} fill="none" stroke="url(#mergeCurrent)" strokeWidth="9" opacity="0.22" />
          <path d={`M-2 ${y} C 30 ${y}, 48 60, 92 60`} fill="none" stroke="var(--color-tealhi)" strokeWidth="1.4" className="merge-flow" opacity="0.85" />
          <circle r="2" fill="var(--color-tealhi)" opacity="0.9">
            <animateMotion dur={`${2.2 + i * 0.35}s`} repeatCount="indefinite" path={`M-2 ${y} C 30 ${y}, 48 60, 92 60`} />
          </circle>
        </g>
      ))}
      <circle cx="88" cy="60" r="4" fill="var(--color-coralhi)" opacity="0.9" />
    </svg>
  );
}

function BoxMark() {
  return (
    <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden className="text-coralhi">
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M3 9l14 6 14-6-14-6z" />
        <path d="M3 9v13l14 6 14-6V9M17 15v13" />
        <path d="M10 6l14 6M24 6l-14 6" opacity=".45" />
      </g>
    </svg>
  );
}

export function MergeCard({ spec }: { spec: MergeSpec }) {
  const { orders, customer, combined, confidence, actions } = spec;
  const platformCurrents = [...new Set(orders.map((order) => order.platform))].map(
    (platform) => {
      const platformOrders = orders.filter((order) => order.platform === platform);
      return {
        platform,
        count: platformOrders.length,
        totalCents: platformOrders.reduce((sum, order) => sum + order.totalCents, 0),
      };
    },
  );
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

      <div className="relative grid items-stretch gap-2 overflow-hidden rounded-md border border-line/50 bg-abyss/35 p-2 sm:grid-cols-[1fr_72px_1.15fr] sm:gap-0">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-35" style={{ background: "radial-gradient(ellipse at 52% 50%, rgba(79,227,207,.12), transparent 48%)" }} />
        <div className="relative flex flex-col justify-center gap-2">
          {platformCurrents.map((current) => (
            <div key={current.platform} className="rounded-sm border border-teal/25 bg-raise/55 px-3 py-3 shadow-[inset_-18px_0_28px_rgba(79,227,207,0.04)]">
              <div className="flex items-center justify-between gap-2">
                <PlatformChip p={current.platform} />
                <span className="font-mono text-sm font-semibold text-tealhi tabular-nums">
                  {usd(current.totalCents)}
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-mute">
                {current.count} {current.count === 1 ? "order" : "orders"} entering this current
              </p>
            </div>
          ))}
        </div>

        <div className="relative min-h-6 sm:min-h-0">
          <Connector n={platformCurrents.length} />
          <p className="text-center font-mono text-[11px] text-teal sm:hidden">
            ≋ currents combine ≋
          </p>
        </div>

        <div className="relative flex flex-col justify-center overflow-hidden rounded-sm border border-coral/40 bg-[linear-gradient(135deg,rgba(15,168,150,.09),rgba(232,86,43,.07))] px-4 py-3 shadow-[0_0_32px_rgba(79,227,207,0.09)]">
          <div aria-hidden className="absolute -right-3 -bottom-3 opacity-25"><BoxMark /></div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <PlatformChip p="combined" />
              <span className="font-mono text-[11px] text-dim">
                {combined.orderId}
              </span>
            </span>
            <span className="flex items-center gap-2"><BoxMark /><Chip className="border-ok/40 text-ok">1 BOX</Chip></span>
          </div>
          <p className="mt-2 font-mono text-3xl leading-none font-semibold text-tealhi tabular-nums">
            {usd(combined.totalCents)}
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-dim">
            → {combined.destination || "destination on file"}
            <span className="text-mute"> · {combined.shipWeek}</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-mute">
            one current · one box · one shipping fee
          </p>
        </div>
      </div>

      <details className="group mt-2 rounded-sm border border-line/60 bg-abyss/25">
        <summary className="cursor-pointer list-none px-3 py-2 font-mono text-[11px] text-dim transition-colors hover:text-teal">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span>{" "}
          View all {orders.length} source orders
        </summary>
        <div className="grid gap-2 border-t border-line/60 p-2 md:grid-cols-2">
          {orders.map((o) => (
            <SourceOrder key={o.orderId} o={o} />
          ))}
        </div>
      </details>

      <ActionRow actions={actions} />
    </SpecCard>
  );
}
