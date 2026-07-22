import type { ComponentSpec } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";
import { usd } from "./format";

type SettlementSpec = Extract<ComponentSpec, { kind: "auction_settlement_report" }>;

export function AuctionSettlementReport({ spec }: { spec: SettlementSpec }) {
  const settled = spec.unpaidOrders === 0 && spec.issues.every((issue) => issue.status === "clear");
  const metrics = [
    [usd(spec.totalRevenueCents), "AUCTION REVENUE"],
    [spec.orderCount, "ORDERS"],
    [spec.winnerCount, "WINNERS"],
    [spec.soldItems, "SOLD ITEMS"],
  ] as const;
  return (
    <SpecCard tag="AUCTION SETTLEMENT" tone={settled ? "teal" : "coral"} right={<Chip>{spec.asOf}</Chip>}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{spec.auctionLabel}</p>
          <p className="mt-1 text-[12px] text-dim">Auction-only financial close · distinct from Wednesday's weekly operational report</p>
        </div>
        <Chip className={settled ? "border-ok/45 text-ok" : "border-warn/45 text-warn"}>{settled ? "FULLY SETTLED" : "FOLLOW-UP OPEN"}</Chip>
      </div>
      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg bg-abyss/45 lg:grid-cols-4">
        {metrics.map(([value, label], index) => (
          <div key={label} className={`px-3 py-3 ${index ? "border-l border-line/55" : ""}`}>
            <p className="font-mono text-[20px] font-semibold text-coralhi">{value}</p>
            <p className="font-mono text-[9px] tracking-[0.07em] text-mute">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [`${spec.paidOrders} paid / ${spec.unpaidOrders} unpaid`, "PAYMENT STATUS"],
          [usd(spec.shippingChargesCents), "SHIPPING CHARGES"],
          [usd(spec.discountsCreditsCents), "DISCOUNTS / CREDITS"],
          [spec.issues.filter((issue) => issue.status === "open").length, "REMAINING ISSUES"],
        ].map(([value, label]) => (
          <div key={String(label)} className="rounded-lg border border-line/55 bg-raise/40 p-3">
            <p className="font-mono text-[15px] text-ink">{value}</p>
            <p className="mt-1 font-mono text-[9px] tracking-[0.06em] text-mute">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 divide-y divide-line/50 rounded-lg border border-line/55">
        {spec.issues.map((issue) => (
          <div key={issue.id} className="flex items-start gap-3 px-3 py-2.5">
            <Chip className={issue.status === "clear" ? "border-ok/45 text-ok" : "border-warn/45 text-warn"}>{issue.status}</Chip>
            <div><p className="text-[12px] font-medium text-ink">{issue.label}</p><p className="mt-0.5 text-[11px] text-dim">{issue.detail}</p></div>
          </div>
        ))}
      </div>
    </SpecCard>
  );
}
