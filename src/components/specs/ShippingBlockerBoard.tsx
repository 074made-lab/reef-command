"use client";

import { useState } from "react";
import type { ComponentSpec, ShippingBlockerGroup } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";

type BlockerSpec = Extract<ComponentSpec, { kind: "shipping_blocker_board" }>;

const TONE: Record<ShippingBlockerGroup["kind"], string> = {
  hold_requests: "text-warn",
  replacement_items: "text-coralhi",
  customer_questions: "text-tealhi",
};

const SHORT_DETAIL: Record<ShippingBlockerGroup["kind"], string> = {
  hold_requests: "Ship timing and address conflicts",
  replacement_items: "DOA replacements joining slips + bag labels",
  customer_questions: "Availability, care, and order instructions",
};

function countLabel(group: ShippingBlockerGroup) {
  const unit = group.count === 1 ? group.unit.replace(/s$/, "") : group.unit;
  return `${group.count} ${unit}`;
}

export function ShippingBlockerBoard({ spec }: { spec: BlockerSpec }) {
  const [handledIds, setHandledIds] = useState<Set<string>>(() => new Set());
  const holds = spec.groups.find((group) => group.kind === "hold_requests");
  const replacements = spec.groups.find((group) => group.kind === "replacement_items");
  const questions = spec.groups.find((group) => group.kind === "customer_questions");
  const hasOpenItems = spec.openCount > 0;
  const allItems = spec.groups.flatMap((group) => group.items);
  const remaining = allItems.filter((item) => !handledIds.has(item.id)).length;
  const handled = hasOpenItems && remaining === 0;

  function approveOne(id: string) {
    setHandledIds((current) => new Set(current).add(id));
  }

  function approveAll() {
    setHandledIds(new Set(allItems.map((item) => item.id)));
  }

  const queueSummary = [
    holds ? `${countLabel(holds)} hold labels` : null,
    replacements ? `${countLabel(replacements)} join packing` : null,
    questions ? `${countLabel(questions)} need review` : null,
  ].filter(Boolean).join(" · ");

  return (
    <SpecCard
      tag="MONDAY SHIPPING BLOCKERS"
      tone={handled ? "teal" : "coral"}
      right={<Chip className={handled ? "border-ok/45 text-ok" : "border-coral/45 text-coralhi"}>{spec.asOf}</Chip>}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[13px] font-semibold tracking-[0.06em] text-ink uppercase">Clear before document lock</p>
            <span className={`font-mono text-[12px] ${handled || !hasOpenItems ? "text-ok" : "text-warn"}`}>
              {handled ? `✓ ${spec.openCount} handled` : hasOpenItems ? `${remaining} open` : "✓ queue clear"}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-dim">
            {handled ? "Review complete. Shipping documents can move forward." : queueSummary}
          </p>
        </div>

        <button
          type="button"
          onClick={approveAll}
          disabled={handled || !hasOpenItems}
          className="shrink-0 rounded-md border border-coral/60 bg-coral px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-abyss transition duration-200 hover:-translate-y-0.5 hover:bg-coralhi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral active:translate-y-0 disabled:cursor-default disabled:border-ok/35 disabled:bg-ok/10 disabled:text-ok"
        >
          {handled ? "✓ ALL APPROVED · HANDLED" : hasOpenItems ? `APPROVE ALL · ${remaining} REQUESTS` : "✓ NOTHING TO APPROVE"}
        </button>
      </div>

      <details className="group mt-3 overflow-hidden rounded-md border border-line/70 bg-raise/45">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-raise focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-coral">
          <span className="font-mono text-[11px] font-medium tracking-[0.06em] text-ink">
            {handled ? "REVIEWED ISSUE SUMMARY" : "REVIEW ISSUE SUMMARY"}
          </span>
          <span className="flex items-center gap-2 font-mono text-[10px] text-mute">
            {remaining} OPEN · {allItems.length} TOTAL
            <span aria-hidden className="transition-transform duration-200 group-open:rotate-180">⌄</span>
          </span>
        </summary>

        <div className="divide-y divide-line/55 border-t border-line/70">
          {spec.groups.map((group) => {
            const groupRemaining = group.items.filter((item) => !handledIds.has(item.id)).length;
            return (
              <section key={group.kind} className="px-3 py-2.5">
                <div className="grid gap-1 sm:grid-cols-[11rem_1fr_auto] sm:items-center sm:gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className={`font-mono text-[11px] font-semibold ${TONE[group.kind]}`}>{countLabel(group)}</span>
                    <span className="text-[11px] text-mute">{group.label}</span>
                  </div>
                  <p className="min-w-0 truncate text-[12px] text-dim" title={SHORT_DETAIL[group.kind]}>
                    {SHORT_DETAIL[group.kind]}
                  </p>
                  <span className={`font-mono text-[10px] ${groupRemaining === 0 ? "text-ok" : "text-warn"}`}>
                    {groupRemaining === 0 ? "HANDLED" : `${groupRemaining} REVIEW`}
                  </span>
                </div>

                {group.items.length ? (
                  <div className="mt-2 divide-y divide-line/45 overflow-hidden rounded-md border border-line/55 bg-abyss/30">
                    {group.items.map((item) => {
                      const itemHandled = handledIds.has(item.id);
                      return (
                        <div key={item.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <details className="group/item min-w-0">
                            <summary className="cursor-pointer list-none text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral">
                              <span className="mr-1 inline-block text-mute transition-transform group-open/item:rotate-90">▸</span>
                              <span>{item.headline}</span>
                            </summary>
                            <p className="mt-1 pl-3.5 text-[11px] leading-relaxed text-dim">{item.detail}</p>
                          </details>
                          <button
                            type="button"
                            onClick={() => approveOne(item.id)}
                            disabled={itemHandled}
                            className="justify-self-start rounded-sm border border-coral/45 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.05em] text-coralhi transition duration-200 hover:bg-coral/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral active:scale-[0.98] disabled:border-ok/30 disabled:bg-ok/5 disabled:text-ok sm:justify-self-end"
                          >
                            {itemHandled ? "✓ HANDLED" : "APPROVE"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </details>

      <p className="mt-2 font-mono text-[9px] tracking-[0.04em] text-mute">
        DEMO APPROVAL ONLY · carrier purchases and customer sends stay gated
      </p>
    </SpecCard>
  );
}
