import type { ComponentSpec, ShippingBlockerGroup } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";

type BlockerSpec = Extract<ComponentSpec, { kind: "shipping_blocker_board" }>;

const TONE: Record<ShippingBlockerGroup["kind"], string> = {
  hold_requests: "border-warn/35 bg-warn/[0.04] text-warn",
  replacement_items: "border-coral/35 bg-coral/[0.04] text-coralhi",
  customer_questions: "border-teal/35 bg-teal/[0.04] text-tealhi",
};

function countLabel(group: ShippingBlockerGroup) {
  const unit = group.count === 1 ? group.unit.replace(/s$/, "") : group.unit;
  return `${group.count} ${unit}`;
}

export function ShippingBlockerBoard({ spec }: { spec: BlockerSpec }) {
  return (
    <SpecCard
      tag="MONDAY SHIPPING BLOCKERS"
      tone="coral"
      right={<Chip className="border-coral/45 text-coralhi">{spec.asOf}</Chip>}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium tracking-[0.06em] text-mute uppercase">Clear before document lock</p>
          <p className="mt-1 text-[14px] leading-relaxed text-dim">
            Holds stop carrier labels. Approved replacements join the packing slip. Customer answers prevent bad addresses and missed instructions.
          </p>
        </div>
        <span className={`font-mono text-[13px] ${spec.openCount ? "text-warn" : "text-ok"}`}>
          {spec.openCount ? `${spec.openCount} open queue records` : "✓ blocker queue clear"}
        </span>
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-3">
        {spec.groups.map((group) => (
          <section key={group.kind} className={`rounded-lg border p-3 ${TONE[group.kind]}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] tracking-[0.08em] uppercase opacity-80">{group.label}</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{countLabel(group)}</p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.05em] ${group.status === "clear" ? "border-ok/40 text-ok" : "border-current/35"}`}>
                {group.status === "clear" ? "CLEAR" : "REVIEW"}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-dim">{group.detail}</p>
            {group.headlines.length ? (
              <ul className="mt-3 space-y-1.5 border-t border-current/15 pt-2">
                {group.headlines.slice(0, 2).map((headline) => (
                  <li key={headline} className="flex gap-2 text-[12px] leading-snug text-ink">
                    <span aria-hidden className="opacity-70">•</span>
                    <span>{headline}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-t border-current/15 pt-2 text-[12px] text-ok">Nothing waiting in this lane.</p>
            )}
          </section>
        ))}
      </div>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-mute">
        LIVE SYNTHETIC QUEUE · open the detailed rows below to review evidence, reply drafts, and hold requests
      </p>
    </SpecCard>
  );
}
