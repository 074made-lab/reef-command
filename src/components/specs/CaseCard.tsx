/** Escalated case: evidence assembled by the system, decision reserved for
 *  the human — the AI never freestyles refunds or claims. */

import type { ActionChip, Evidence } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { SpecCard } from "./bits";

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return null;
  return (
    <ul className="space-y-1.5">
      {evidence.map((e) => (
        <li key={e.label + e.detail} className="flex gap-2 text-[12px]">
          <span className="shrink-0 font-mono text-[11px] text-tealhi">
            {e.href ? (
              <a href={e.href} className="underline decoration-teal/50 underline-offset-2 hover:text-ink">
                {e.label}
              </a>
            ) : (
              e.label
            )}
          </span>
          <span className="text-dim">{e.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function CaseCard({
  caseId,
  title,
  evidence,
  actions,
}: {
  caseId: string;
  title: string;
  evidence: Evidence[];
  actions: ActionChip[];
}) {
  return (
    <SpecCard
      tag="CASE"
      tone="coral"
      right={<span className="font-mono text-[10px] text-mute">{caseId}</span>}
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      <div className="mt-2.5 rounded-sm border border-line/60 bg-raise/40 px-3 py-2">
        <p className="mb-1.5 font-mono text-[10px] tracking-widest text-mute">
          EVIDENCE
        </p>
        <EvidenceList evidence={evidence} />
      </div>
      <ActionRow actions={actions} />
    </SpecCard>
  );
}
