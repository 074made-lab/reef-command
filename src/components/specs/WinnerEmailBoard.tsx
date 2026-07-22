"use client";

import { useState } from "react";
import type { ComponentSpec } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, SpecCard } from "./bits";
import { usd } from "./format";

type WinnerSpec = Extract<ComponentSpec, { kind: "winner_email_board" }>;

export function WinnerEmailBoard({ spec }: { spec: WinnerSpec }) {
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  return (
    <SpecCard tag="WINNER EMAILS" tone="coral" right={<Chip>{spec.asOf}</Chip>}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{spec.title}</p>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-dim">{spec.note}</p>
        </div>
        <p className="font-mono text-[11px] text-mute">{sent.size}/{spec.winners.length} SIMULATED EMAILS</p>
      </div>
      <div className="mt-4 space-y-3">
        {spec.winners.map((winner) => {
          const done = sent.has(winner.id);
          return (
            <article key={winner.id} className="overflow-hidden rounded-lg border border-line/60 bg-raise/40">
              <div className="flex flex-wrap items-center gap-2 border-b border-line/55 px-3.5 py-2.5">
                <Chip className={done ? "border-ok/45 text-ok" : "border-coral/45 text-coralhi"}>{done ? "APPROVED" : "REVIEW"}</Chip>
                <p className="font-medium text-ink">{winner.winner}</p>
                <p className="ml-auto font-mono text-[13px] text-coralhi">{usd(winner.totalCents)}</p>
              </div>
              <div className="grid gap-4 p-3.5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.2fr)]">
                <div>
                  <p className="font-mono text-[9px] tracking-[0.07em] text-mute">WON ITEMS</p>
                  <div className="mt-2 space-y-1.5">
                    {winner.items.map((item) => (
                      <div key={item.lotId} className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="text-dim">{item.name} · <span className="font-mono text-mute">{item.lotId}</span></span>
                        <span className="font-mono text-ink">{usd(item.priceCents)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-md bg-abyss/45 p-2.5"><p className="text-mute">ADD-ON CODE</p><p className="mt-1 font-mono text-tealhi">{winner.addonCode}</p></div>
                    <div className="rounded-md bg-abyss/45 p-2.5"><p className="text-mute">PAYMENT DUE</p><p className="mt-1 font-mono text-ink">{winner.paymentDeadline}</p></div>
                  </div>
                </div>
                <div className="rounded-md bg-abyss/40 p-3">
                  <p className="text-[13px] font-semibold text-ink">{winner.subject}</p>
                  <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-dim">{winner.body}</p>
                  <p className="mt-2 font-mono text-[10px] text-mute">SHIPPING SELECTION DUE · {winner.shippingDeadline}</p>
                </div>
              </div>
              <div className="px-3.5 pb-3.5">
                {done ? <p className="font-mono text-[10px] text-ok">✓ WINNER EMAIL APPROVAL RECORDED · no external email sent</p> : (
                  <ActionRow actions={[winner.action]} onComplete={() => setSent((current) => new Set(current).add(winner.id))} />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </SpecCard>
  );
}
