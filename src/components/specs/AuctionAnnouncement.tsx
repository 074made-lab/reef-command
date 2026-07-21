import type { ComponentSpec, MessagePreview } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, SpecCard } from "./bits";
import { num } from "./format";

type AnnouncementSpec = Extract<ComponentSpec, { kind: "auction_announcement" }>;

function Draft({ preview, recipients }: { preview: MessagePreview; recipients: number }) {
  return (
    <article className="rounded-lg border border-line/70 bg-raise/45 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chip className="border-teal/50 text-tealhi">{preview.channel.toUpperCase()}</Chip>
        <span className="font-mono text-[11px] tabular-nums text-mute">
          {num(recipients)} synthetic recipients
        </span>
      </div>
      {preview.subject ? (
        <p className="mt-3 text-[14px] font-semibold text-ink">{preview.subject}</p>
      ) : null}
      <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-dim">{preview.body}</p>
    </article>
  );
}

export function AuctionAnnouncement({ spec }: { spec: AnnouncementSpec }) {
  return (
    <SpecCard
      tag="NEXT AUCTION ANNOUNCEMENT"
      tone="coral"
      right={<Chip className="border-coral/50 text-coralhi">HUMAN APPROVAL</Chip>}
    >
      <div className="grid gap-4 md:grid-cols-[1.15fr_.85fr] md:items-end">
        <div>
          <p className="font-mono text-[10px] tracking-[0.08em] text-mute">NEXT REEFNBID WINDOW</p>
          <p className="mt-1 text-balance text-[24px] leading-tight font-semibold tracking-[-0.025em] text-ink">
            {spec.dateRange}
          </p>
        </div>
        <div className="rounded-lg border border-coral/30 bg-coral/[0.06] px-3.5 py-3 md:text-right">
          <p className="font-mono text-[10px] tracking-[0.08em] text-coral">FINAL CLOSE</p>
          <p className="mt-1 text-[15px] font-semibold text-coralhi">{spec.closeTime}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Draft preview={spec.emailPreview} recipients={spec.emailRecipients} />
        <Draft preview={spec.smsPreview} recipients={spec.smsRecipients} />
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-mute">
        Demo recipients and messages only. Approval records simulated sends in the local audit trail; no external service is contacted.
      </p>
      <ActionRow actions={spec.actions} />
    </SpecCard>
  );
}
