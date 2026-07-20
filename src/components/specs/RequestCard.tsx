/** Inbound customer request: what they asked, what the system already did
 *  safely on its own (e.g. voided the label first), what needs the human. */

import type { ActionChip, CustomerRequest } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, SpecCard, TierBadge } from "./bits";
import { shortTime, titleize } from "./format";

export function RequestCard({
  request,
  autoActionsTaken,
  actions,
}: {
  request: CustomerRequest;
  autoActionsTaken: string[];
  actions: ActionChip[];
}) {
  return (
    <SpecCard
      tag="CUSTOMER REQUEST"
      tone="coral"
      right={
        <span className="font-mono text-[10px] text-mute">
          {shortTime(request.receivedAt)}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip className="border-coral/50 text-coralhi">
          {titleize(request.kind).toUpperCase()}
        </Chip>
        <span className="text-sm font-medium text-ink">
          {request.customer.displayName}
        </span>
        <TierBadge tier={request.customer.tier} />
        {request.orderIds.map((id) => (
          <Chip key={id}>{id}</Chip>
        ))}
        <span className="font-mono text-[10px] text-mute">{request.requestId}</span>
      </div>

      <blockquote className="mt-3 border-l-2 border-coral/60 pl-3 text-[13px] text-dim italic">
        {request.detail}
      </blockquote>

      {autoActionsTaken.length ? (
        <ul className="mt-3 space-y-1">
          {autoActionsTaken.map((a) => (
            <li key={a} className="flex items-center gap-2 font-mono text-[11px] text-ok">
              <span aria-hidden>✓</span> auto: {a}
            </li>
          ))}
        </ul>
      ) : null}

      <ActionRow actions={actions} />
    </SpecCard>
  );
}
