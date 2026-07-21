/** Synthetic communication fixture. Bands, recipients, and timing are
 * arbitrary UI data, not a production campaign or targeting method. */

import type { ComponentSpec } from "@/lib/protocol";
import { ActionRow } from "./ActionChips";
import { Chip, PlatformChip, SpecCard } from "./bits";
import { num } from "./format";

type CampaignSpec = Extract<ComponentSpec, { kind: "campaign_card" }>;

export function CampaignCard({ spec }: { spec: CampaignSpec }) {
  const { campaignId, phase, audience, preview, schedule, actions } = spec;
  const tiers = Object.entries(audience.byTier) as ["1" | "2" | "3" | "4", number][];
  const maxTier = Math.max(...tiers.map(([, n]) => n), 1);
  return (
    <SpecCard
      tag="CAMPAIGN"
      right={
        <span className="flex items-center gap-2">
          <Chip>{phase.replace(/_/g, " ")}</Chip>
          <span className="font-mono text-[10px] text-mute">{campaignId}</span>
        </span>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-mute">AUDIENCE</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-ink tabular-nums">
            {num(audience.total)}
            <span className="ml-1.5 text-xs font-normal text-mute">recipients</span>
          </p>
          <p className="mt-1 text-[12px] text-dim">{audience.criteria}</p>

          <div className="mt-3 space-y-1">
            {tiers.map(([t, n]) => (
              <div key={t} className="flex items-center gap-2">
                <span className="w-8 font-mono text-[10px] text-mute">
                  {`B${t}`}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-sm bg-raise/60">
                  <div
                    className="h-full rounded-r-[3px] bg-teal/80"
                    style={{ width: `${(n / maxTier) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-[10px] text-dim tabular-nums">
                  {num(n)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(audience.byPlatform).map(([p, n]) => (
              <span key={p} className="flex items-center gap-1">
                <PlatformChip p={p} />
                <span className="font-mono text-[10px] text-dim tabular-nums">{num(n)}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-sm border border-line/70 bg-raise/40 p-3">
          <div className="flex items-center justify-between">
            <Chip className="border-tealhi/50 text-tealhi">
              {preview.channel.toUpperCase()}
            </Chip>
            <span className="font-mono text-[10px] text-mute">{schedule}</span>
          </div>
          {preview.subject ? (
            <p className="mt-2 text-[13px] font-medium text-ink">{preview.subject}</p>
          ) : null}
          <p className="mt-1.5 text-[12px] leading-relaxed whitespace-pre-wrap text-dim">
            {preview.body}
          </p>
        </div>
      </div>

      <ActionRow actions={actions} />
    </SpecCard>
  );
}
