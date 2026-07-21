import type { ComponentSpec } from "@/lib/protocol";
import { Chip, PlatformChip, SpecCard, StatusChip } from "./bits";
import { num, shortTime, usd } from "./format";

type AddonBoardSpec = Extract<ComponentSpec, { kind: "addon_order_board" }>;

export function AddonOrderBoard({ spec }: { spec: AddonBoardSpec }) {
  const metrics = [
    ["ADD-ON ORDERS", num(spec.totalOrders)],
    ["CORAL UNITS", num(spec.coralUnits)],
    ["ADD-ON VALUE", usd(spec.totalCents)],
    ["COMBINE READY", num(spec.combineReady)],
  ];
  return (
    <SpecCard
      tag="ADD-ON ORDER BOARD"
      right={<Chip className="border-teal/50 text-tealhi">LIVE SYNTHETIC</Chip>}
    >
      <p className="text-[12px] text-mute">{spec.windowLabel}</p>

      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="bg-raise/70 px-3 py-3">
            <p className="font-mono text-[10px] tracking-[0.08em] text-mute">{label}</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(spec.platformCounts).map(([platform, count]) => (
          <span key={platform} className="inline-flex items-center gap-1.5">
            <PlatformChip p={platform} />
            <span className="font-mono text-[11px] tabular-nums text-dim">{num(count ?? 0)}</span>
          </span>
        ))}
      </div>

      {spec.orders.length ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line/70">
          <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
            <thead className="bg-raise/65 font-mono text-[10px] tracking-[0.08em] text-mute">
              <tr>
                <th className="px-3 py-2 font-medium">ORDER</th>
                <th className="px-3 py-2 font-medium">CUSTOMER</th>
                <th className="px-3 py-2 font-medium">CHANNEL</th>
                <th className="px-3 py-2 text-right font-medium">CORALS</th>
                <th className="px-3 py-2 text-right font-medium">VALUE</th>
                <th className="px-3 py-2 font-medium">MERGE</th>
                <th className="px-3 py-2 font-medium">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {spec.orders.map((order) => (
                <tr key={order.orderId} className="border-t border-line/55">
                  <td className="px-3 py-2.5">
                    <p className="font-mono text-[11px] text-ink">{order.orderId}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-mute">{shortTime(order.orderedAt)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-dim">{order.customer}</td>
                  <td className="px-3 py-2.5"><PlatformChip p={order.platform} /></td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">{order.coralUnits}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-tealhi">{usd(order.totalCents)}</td>
                  <td className="px-3 py-2.5">
                    <Chip className={order.combineReady ? "border-coral/45 text-coralhi" : "border-line text-mute"}>
                      {order.combineReady ? "READY" : "ADD-ON ONLY"}
                    </Chip>
                  </td>
                  <td className="px-3 py-2.5"><StatusChip s={order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-mute">
          No add-on orders are open in this synthetic window.
        </div>
      )}
    </SpecCard>
  );
}
