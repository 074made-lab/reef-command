"use client";

import type { ComponentSpec, CustomerResolutionItem } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, SpecCard } from "./bits";
import { usePersistentResolution } from "./usePersistentResolution";

type ResolutionSpec = Extract<ComponentSpec, { kind: "customer_resolution_board" }>;

const LABEL: Record<CustomerResolutionItem["kind"], string> = {
  unanswered_message: "MESSAGE",
  shipping_problem: "SHIPPING",
  doa: "DOA",
  replacement_credit: "FOLLOW-UP",
  address_issue: "ADDRESS",
  order_question: "ORDER",
};

export function CustomerResolutionBoard({ spec }: { spec: ResolutionSpec }) {
  const { resolved, resolve } = usePersistentResolution(
    `customer-resolution:${spec.asOf}`,
    spec.items.map((item) => item.id),
  );
  const open = spec.items.length - resolved.size;

  return (
    <SpecCard tag="CUSTOMER RESOLUTION" tone={open ? "coral" : "teal"} right={<Chip>{spec.asOf}</Chip>}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{spec.title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-dim">{spec.note}</p>
        </div>
        <div className="rounded-lg bg-abyss/50 px-4 py-2 text-right">
          <p className={`font-mono text-[20px] font-semibold ${open ? "text-coralhi" : "text-ok"}`}>{open}</p>
          <p className="font-mono text-[9px] tracking-[0.07em] text-mute">OPEN</p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-line/55 overflow-hidden rounded-lg bg-raise/45">
        {spec.items.map((item) => {
          const done = resolved.has(item.id);
          return (
            <article key={item.id} className={`p-3.5 ${done ? "bg-ok/[0.035]" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Chip className={done ? "border-ok/45 text-ok" : "border-coral/45 text-coralhi"}>{done ? "RESOLVED" : LABEL[item.kind]}</Chip>
                <span className="font-mono text-[10px] text-mute">{item.openedAt}</span>
                <span className="ml-auto font-mono text-[10px] text-dim">{item.customer} · {item.orderId}</span>
              </div>
              <h3 className="mt-2 text-[14px] font-semibold text-ink">{item.headline}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-dim">{item.detail}</p>
              {item.shipmentId || item.tracking ? (
                <p className="mt-2 font-mono text-[10px] text-mute">{item.shipmentId ?? "NO SHIPMENT"} · {item.tracking ?? "NO TRACKING"}</p>
              ) : null}
              <p className="mt-2 border-l border-teal/35 pl-2.5 text-[12px] leading-relaxed text-tealhi">{item.nextAction}</p>
              {done ? (
                <p className="mt-2 font-mono text-[10px] text-ok">✓ NEXT ACTION RECORDED · synthetic demo state</p>
              ) : (
                <ActionRow actions={[item.action]} onComplete={() => resolve(item.id)} />
              )}
            </article>
          );
        })}
      </div>
    </SpecCard>
  );
}
