/** One order, its line items, and its life so far (timeline). */

import type { OrderSummary, TimelineStep, ActionChip } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { PlatformChip, SpecCard, StatusChip, TierBadge } from "./bits";
import { shortTime, usd } from "./format";

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const dot =
          s.status === "done"
            ? "bg-teal"
            : s.status === "current"
              ? "bg-tealhi pulse-dot"
              : s.status === "blocked"
                ? "bg-danger"
                : "border border-mute";
        return (
          <li key={s.label} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} />
              {i < steps.length - 1 ? (
                <span className="w-px flex-1 bg-line" />
              ) : null}
            </div>
            <div className="pb-2.5">
              <p
                className={`text-[12px] leading-tight ${
                  s.status === "current"
                    ? "text-tealhi"
                    : s.status === "blocked"
                      ? "text-danger"
                      : s.status === "done"
                        ? "text-ink"
                        : "text-mute"
                }`}
              >
                {s.label}
              </p>
              {s.at ? (
                <p className="font-mono text-[10px] text-mute">{shortTime(s.at)}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderCard({
  order,
  timeline,
  actions,
}: {
  order: OrderSummary;
  timeline: TimelineStep[];
  actions?: ActionChip[];
}) {
  return (
    <SpecCard tag="ORDER" right={<StatusChip s={order.status} />}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-ink">
          {order.orderId}
        </span>
        <PlatformChip p={order.platform} />
        <span className="text-[13px] text-dim">{order.customer.displayName}</span>
        <TierBadge tier={order.customer.tier} />
        <span className="ml-auto font-mono text-[11px] text-mute">
          → {order.destination} · {order.shipWeek}
        </span>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[1.5fr_1fr]">
        <div>
          {order.items.length ? (
            <div className="overflow-x-auto rounded-sm border border-line/60">
              <table className="w-full min-w-[320px] border-collapse text-[12px]">
                <tbody>
                  {order.items.map((it, i) => (
                    <tr key={it.sku + i} className="border-b border-line/40 last:border-0">
                      <td className="px-2.5 py-1.5 font-mono text-[10px] whitespace-nowrap text-mute">
                        {it.sku}
                      </td>
                      <td className="px-2.5 py-1.5 text-ink">{it.name}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-dim tabular-nums">
                        ×{it.qty}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-tealhi tabular-nums">
                        {usd(it.priceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="font-mono text-[11px] text-mute">items on file</p>
          )}
          <p className="mt-2 text-right font-mono text-lg font-semibold text-ink tabular-nums">
            {usd(order.totalCents)}
          </p>
        </div>
        <Timeline steps={timeline} />
      </div>

      <ActionRow actions={actions} />
    </SpecCard>
  );
}
