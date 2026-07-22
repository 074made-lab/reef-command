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
  const [handled, setHandled] = useState(false);
  const holds = spec.groups.find((group) => group.kind === "hold_requests");
  const replacements = spec.groups.find((group) => group.kind === "replacement_items");
  const questions = spec.groups.find((group) => group.kind === "customer_questions");
  const hasOpenItems = spec.openCount > 0;

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
              {handled ? `✓ ${spec.openCount} handled` : hasOpenItems ? `${spec.openCount} open` : "✓ queue clear"}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-dim">
            {handled ? "Review complete. Shipping documents can move forward." : queueSummary}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setHandled(true)}
          disabled={handled || !hasOpenItems}
          className="shrink-0 rounded-md border border-coral/60 bg-coral px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-abyss transition duration-200 hover:-translate-y-0.5 hover:bg-coralhi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral active:translate-y-0 disabled:cursor-default disabled:border-ok/35 disabled:bg-ok/10 disabled:text-ok"
        >
          {handled ? "✓ APPROVED · HANDLED" : hasOpenItems ? "APPROVE ALL · MARK HANDLED" : "✓ NOTHING TO APPROVE"}
        </button>
      </div>

      <details className="group mt-3 overflow-hidden rounded-md border border-line/70 bg-raise/45">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-raise focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-coral">
          <span className="font-mono text-[11px] font-medium tracking-[0.06em] text-ink">
            {handled ? "REVIEWED ISSUE SUMMARY" : "REVIEW ISSUE SUMMARY"}
          </span>
          <span className="flex items-center gap-2 font-mono text-[10px] text-mute">
            3 CATEGORIES
            <span aria-hidden className="transition-transform duration-200 group-open:rotate-180">⌄</span>
          </span>
        </summary>

        <div className="divide-y divide-line/55 border-t border-line/70">
          {spec.groups.map((group) => (
            <section key={group.kind} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[11rem_1fr_auto] sm:items-center sm:gap-3">
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-[11px] font-semibold ${TONE[group.kind]}`}>{countLabel(group)}</span>
                <span className="text-[11px] text-mute">{group.label}</span>
              </div>
              <p className="min-w-0 truncate text-[12px] text-dim" title={group.headlines[0] ?? SHORT_DETAIL[group.kind]}>
                {group.headlines[0] ?? SHORT_DETAIL[group.kind]}
                {group.headlines.length > 1 ? ` +${group.headlines.length - 1} more` : ""}
              </p>
              <span className={`font-mono text-[10px] ${handled || group.status === "clear" ? "text-ok" : "text-warn"}`}>
                {handled ? "HANDLED" : group.status === "clear" ? "CLEAR" : "REVIEW"}
              </span>
            </section>
          ))}
        </div>
      </details>

      <p className="mt-2 font-mono text-[9px] tracking-[0.04em] text-mute">
        DEMO APPROVAL ONLY · carrier purchases and customer sends stay gated
      </p>
    </SpecCard>
  );
}
