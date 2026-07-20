/** The morning sweep: what needs the merchant, oldest debt first.
 *  Age tone: green < 1h · amber < 24h · red beyond. */

import type { AttentionItem } from "@/lib/protocol";
import { PlatformChip, SpecCard } from "./bits";
import { age, ageTone } from "./format";

function KindIcon({ kind }: { kind: AttentionItem["kind"] }) {
  const stroke = {
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden className="shrink-0">
      {kind === "new_order" && (
        <g {...stroke}>
          <circle cx="7.5" cy="7.5" r="5.5" />
          <path d="M7.5 5v5M5 7.5h5" />
        </g>
      )}
      {kind === "merge" && (
        <g {...stroke}>
          <path d="M2 3l4.5 4.5L2 12M6.5 7.5H13M10.5 5L13 7.5 10.5 10" />
        </g>
      )}
      {kind === "request" && (
        <g {...stroke}>
          <path d="M2 3h11v7H7l-3 3v-3H2z" />
          <path d="M7.5 6.2v.1" strokeWidth="2" />
        </g>
      )}
      {kind === "case" && (
        <g {...stroke}>
          <path d="M3.5 2v11M3.5 2.5h8L9 5l2.5 2.5h-8" />
        </g>
      )}
      {kind === "message" && (
        <g {...stroke}>
          <rect x="2" y="3.5" width="11" height="8" rx="1" />
          <path d="M2.5 4.5L7.5 8.5 12.5 4.5" />
        </g>
      )}
      {kind === "system" && (
        <g {...stroke}>
          <circle cx="7.5" cy="7.5" r="2.5" />
          <path d="M7.5 1.5v2.2M7.5 11.3v2.2M1.5 7.5h2.2M11.3 7.5h2.2" />
        </g>
      )}
    </svg>
  );
}

const KIND_TONE: Record<AttentionItem["kind"], string> = {
  new_order: "text-tealhi",
  merge: "text-coralhi",
  request: "text-warn",
  case: "text-danger",
  message: "text-dim",
  system: "text-mute",
};

export function AttentionFeed({ items }: { items: AttentionItem[] }) {
  return (
    <SpecCard
      tag="ATTENTION"
      right={
        <span className="font-mono text-[10px] text-mute">
          {items.length} open
        </span>
      }
    >
      {items.length === 0 ? (
        <p className="py-2 text-center font-mono text-xs text-mute">
          feed clear — nothing needs you
        </p>
      ) : (
        <ul className="divide-y divide-line/50">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2.5 py-2 first:pt-0.5 last:pb-0.5">
              <span className={KIND_TONE[it.kind]}>
                <KindIcon kind={it.kind} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {it.headline}
              </span>
              {it.platform ? <PlatformChip p={it.platform} /> : null}
              <span
                className={`w-9 shrink-0 text-right font-mono text-[11px] tabular-nums ${ageTone(it.ageMinutes)}`}
              >
                {age(it.ageMinutes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SpecCard>
  );
}
