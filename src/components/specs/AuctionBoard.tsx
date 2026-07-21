/** Live lot ranking: current bid large, leader handle, bid count.
 *  A recessive bar behind each row shows bid relative to the top lot. */

import type { LotPrice } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";
import { shortTime, usd } from "./format";

export function AuctionBoard({
  lots,
  closesAt,
  state = "live",
}: {
  lots: LotPrice[];
  closesAt: string;
  state?: "upcoming" | "live" | "closed";
}) {
  const top = Math.max(...lots.map((l) => l.currentBidCents), 1);
  const badge =
    state === "closed"
      ? { cls: "border-mute/50 text-mute", text: `closed · ${shortTime(closesAt)}` }
      : state === "upcoming"
        ? { cls: "border-teal/50 text-teal", text: "opens Thursday" }
        : { cls: "border-coral/50 text-coralhi", text: `live · closes ${shortTime(closesAt)}` };
  return (
    <SpecCard
      tag="AUCTION BOARD"
      right={<Chip className={badge.cls}>{badge.text}</Chip>}
    >
      {lots.length === 0 ? (
        <p className="py-2 text-center font-mono text-xs text-mute">
          no bids on the board this cycle
        </p>
      ) : (
        <ol className="divide-y divide-line/50">
          {lots.map((l, i) => (
            <li key={l.lotId} className="relative overflow-hidden">
              <div
                className="absolute inset-y-1 left-0 rounded-r-[4px] bg-teal/10"
                style={{ width: `${(l.currentBidCents / top) * 100}%` }}
                aria-hidden
              />
              <div className="relative flex items-center gap-3 px-1 py-2">
                <span
                  className={`w-6 shrink-0 text-right font-mono text-[12px] tabular-nums ${
                    i === 0 ? "text-tealhi" : "text-mute"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-ink">{l.name}</p>
                  <p className="font-mono text-[12px] text-mute">
                    {l.category} · {l.lotId}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`font-mono text-lg leading-tight font-semibold tabular-nums ${
                      i === 0 ? "text-tealhi" : "text-ink"
                    }`}
                  >
                    {usd(l.currentBidCents)}
                  </p>
                  <p className="font-mono text-[12px] text-dim">
                    {l.leader} · {l.bidCount} bid{l.bidCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SpecCard>
  );
}
