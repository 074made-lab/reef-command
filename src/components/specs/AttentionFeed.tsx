"use client";

/** Interactive morning sweep. DOA rows reveal synthetic evidence and a human
 * decision; unanswered messages reveal a deterministic, editable reply draft.
 * All actions are explicitly demo-only — no refund or external email occurs. */

import { useState } from "react";
import type { AttentionItem } from "@/lib/protocol";
import { PlatformChip, SpecCard } from "./bits";
import { age, ageTone } from "./format";

function KindIcon({ kind }: { kind: AttentionItem["kind"] }) {
  const stroke = { stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <svg width="16" height="16" viewBox="0 0 15 15" aria-hidden className="shrink-0">
      {kind === "new_order" && <g {...stroke}><circle cx="7.5" cy="7.5" r="5.5" /><path d="M7.5 5v5M5 7.5h5" /></g>}
      {kind === "merge" && <g {...stroke}><path d="M2 3l4.5 4.5L2 12M6.5 7.5H13M10.5 5L13 7.5 10.5 10" /></g>}
      {kind === "request" && <g {...stroke}><path d="M2 3h11v7H7l-3 3v-3H2z" /><path d="M7.5 6.2v.1" strokeWidth="2" /></g>}
      {kind === "case" && <g {...stroke}><path d="M3.5 2v11M3.5 2.5h8L9 5l2.5 2.5h-8" /></g>}
      {kind === "message" && <g {...stroke}><rect x="2" y="3.5" width="11" height="8" rx="1" /><path d="M2.5 4.5L7.5 8.5 12.5 4.5" /></g>}
      {kind === "system" && <g {...stroke}><circle cx="7.5" cy="7.5" r="2.5" /><path d="M7.5 1.5v2.2M7.5 11.3v2.2M1.5 7.5h2.2M11.3 7.5h2.2" /></g>}
    </svg>
  );
}

const KIND_TONE: Record<AttentionItem["kind"], string> = {
  new_order: "text-tealhi", merge: "text-coralhi", request: "text-warn",
  case: "text-danger", message: "text-dim", system: "text-mute",
};

function DoaDetail({ item, approved, onApprove }: { item: AttentionItem; approved: boolean; onApprove: () => void }) {
  return (
    <div className="grid gap-3 border-t border-line/60 bg-danger/[0.025] p-3 md:grid-cols-[1fr_220px]">
      <div>
        <span className="font-mono text-[10px] tracking-[0.16em] text-danger uppercase">Customer’s original message</span>
        <blockquote className="mt-1.5 border-l-2 border-danger/45 pl-3 text-[13px] leading-relaxed text-ink">
          “{item.detail || "One frag did not survive shipping. Please review the evidence."}”
        </blockquote>
        <dl className="mt-3 grid grid-cols-[90px_1fr] gap-x-2 gap-y-1 text-[11px]">
          <dt className="font-mono text-mute">customer</dt><dd className="text-dim">{item.customerName ?? "synthetic customer"}</dd>
          <dt className="font-mono text-mute">email</dt><dd className="text-dim">{item.customerEmail ?? "synthetic@example.test"}</dd>
          <dt className="font-mono text-mute">case</dt><dd className="font-mono text-dim">{item.id}</dd>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={approved}
            onClick={onApprove}
            className="rounded-sm border border-coral/65 bg-coral/10 px-3 py-1.5 font-mono text-[11px] tracking-wide text-coralhi hover:bg-coral/20 disabled:border-ok/40 disabled:bg-ok/[0.06] disabled:text-ok"
          >
            {approved ? "✓ APPROVED IN DEMO" : "APPROVE CLAIM"}
          </button>
          <span className="text-[10px] text-mute">human decision · synthetic state only · no refund issued</span>
        </div>
      </div>
      <a href={item.photoHref ?? "/mock-doa-coral.svg"} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-md border border-line bg-abyss">
        <img src={item.photoHref ?? "/mock-doa-coral.svg"} alt="Synthetic mock DOA evidence" className="aspect-[8/5] w-full object-cover transition-transform group-hover:scale-[1.02]" />
        <span className="flex items-center justify-between px-2.5 py-1.5 font-mono text-[10px] text-mute">
          <span>MOCK PHOTO</span><span className="text-tealhi">OPEN ↗</span>
        </span>
      </a>
    </div>
  );
}

function MessageDetail({ item, draft, sent, onDraft, onSend }: {
  item: AttentionItem; draft: string; sent: boolean;
  onDraft: (value: string) => void; onSend: () => void;
}) {
  return (
    <div className="border-t border-line/60 bg-teal/[0.025] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="font-mono text-mute">TO</span>
        <span className="text-ink">{item.customerName ?? "synthetic customer"}</span>
        <span className="text-dim">&lt;{item.customerEmail ?? "customer@example.test"}&gt;</span>
        {item.platform ? <PlatformChip p={item.platform} /> : null}
      </div>
      <div className="rounded-sm border border-line bg-abyss/55 p-2.5">
        <span className="font-mono text-[10px] tracking-[0.16em] text-teal uppercase">Teddy’s template draft · editable</span>
        <textarea
          aria-label={`Reply draft for ${item.customerName ?? item.id}`}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          disabled={sent}
          rows={4}
          className="mt-2 w-full resize-y rounded-sm border border-line bg-panel px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-teal/70 disabled:opacity-65"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSend}
          disabled={sent || !draft.trim()}
          className="rounded-sm border border-teal/60 bg-teal/10 px-3 py-1.5 font-mono text-[11px] tracking-wide text-tealhi hover:bg-teal/20 disabled:border-ok/35 disabled:text-ok"
        >
          {sent ? "✓ SENT · SIMULATED" : "SEND REPLY"}
        </button>
        <span className="text-[10px] text-mute">simulated sender · no external email leaves this demo</span>
      </div>
    </div>
  );
}

export function AttentionFeed({ items }: { items: AttentionItem[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, i.draft ?? ""])));
  const resolvedCount = items.filter((item) => approved[item.id] || sent[item.id]).length;
  const remaining = items.length - resolvedCount;

  return (
    <SpecCard tag="ATTENTION" right={<span className="font-mono text-[11px] text-mute">{remaining} open{resolvedCount ? ` · ${resolvedCount} handled` : ""}</span>}>
      {items.length === 0 ? (
        <p className="py-2 text-center font-mono text-xs text-mute">feed clear — nothing needs you</p>
      ) : (
        <ul className="divide-y divide-line/50">
          {items.map((item) => {
            const expandable = (item.kind === "case" && !!item.photoHref) || item.kind === "message" || !!item.detail;
            const expanded = !!open[item.id];
            const handled = !!approved[item.id] || !!sent[item.id];
            return (
              <li key={item.id} className={`overflow-hidden transition-opacity ${handled ? "opacity-65" : ""}`}>
                <button
                  type="button"
                  aria-expanded={expandable ? expanded : undefined}
                  disabled={!expandable}
                  onClick={() => expandable && setOpen((s) => ({ ...s, [item.id]: !s[item.id] }))}
                  className="flex w-full items-center gap-2.5 py-2.5 text-left disabled:cursor-default"
                >
                  <span className={KIND_TONE[item.kind]}><KindIcon kind={item.kind} /></span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.headline}</span>
                  {item.platform ? <PlatformChip p={item.platform} /> : null}
                  {handled ? <span className="rounded-sm border border-ok/35 px-1.5 py-px font-mono text-[10px] text-ok">HANDLED</span> : null}
                  <span className={`w-9 shrink-0 text-right font-mono text-[11px] tabular-nums ${ageTone(item.ageMinutes)}`}>{age(item.ageMinutes)}</span>
                  {expandable ? <span className={`text-[12px] text-teal transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden>⌄</span> : null}
                </button>
                {expanded && item.kind === "case" && item.photoHref ? (
                  <DoaDetail item={item} approved={!!approved[item.id]} onApprove={() => setApproved((s) => ({ ...s, [item.id]: true }))} />
                ) : null}
                {expanded && item.kind === "message" ? (
                  <MessageDetail
                    item={item}
                    draft={drafts[item.id] ?? item.draft ?? ""}
                    sent={!!sent[item.id]}
                    onDraft={(value) => setDrafts((s) => ({ ...s, [item.id]: value }))}
                    onSend={() => setSent((s) => ({ ...s, [item.id]: true }))}
                  />
                ) : null}
                {expanded && item.kind !== "case" && item.kind !== "message" && item.detail ? (
                  <p className="border-t border-line/60 bg-raise/30 p-3 text-[12px] text-dim">{item.detail}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SpecCard>
  );
}
