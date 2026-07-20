/** A judgment with its receipts: the one-line verdict, how sure the system
 *  is, and the evidence trail behind it. */

import type { Evidence } from "@/lib/protocol";
import { ConfidenceMeter, SpecCard } from "./bits";
import { EvidenceList } from "./CaseCard";

export function VerdictCard({
  verdict,
  confidence,
  evidence,
}: {
  verdict: string;
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
}) {
  return (
    <SpecCard tag="VERDICT" right={<ConfidenceMeter level={confidence} />}>
      <p className="text-[15px] leading-snug text-ink">{verdict}</p>
      {evidence.length ? (
        <div className="mt-2.5 border-t border-line/60 pt-2.5">
          <EvidenceList evidence={evidence} />
        </div>
      ) : null}
    </SpecCard>
  );
}
