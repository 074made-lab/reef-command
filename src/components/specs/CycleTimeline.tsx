/** The weekly rhythm: THU auction → SAT winners → SUN–MON add-ons →
 *  MON labels → TUE–WED ship → WED report. Current step pulses. */

import type { PhaseStep, WeekPhase } from "@/lib/protocol";
import { SpecCard } from "./bits";
import { shortTime } from "./format";

const PHASE_NAME: Record<WeekPhase, string> = {
  announce: "Announce",
  auction_live: "Auction live",
  winners: "Winners",
  addon_window: "Add-on window",
  label_day: "Label day",
  ship_days: "Ship days",
  report: "Report",
};

export function CycleTimeline({
  phase,
  upcoming,
}: {
  phase: WeekPhase;
  upcoming: PhaseStep[];
}) {
  return (
    <SpecCard
      tag="WEEK CYCLE"
      right={
        <span className="font-mono text-[10px] tracking-widest text-tealhi">
          {PHASE_NAME[phase].toUpperCase()}
        </span>
      }
    >
      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-max items-stretch gap-0">
          {upcoming.map((s, i) => {
            const tone =
              s.status === "current"
                ? "text-tealhi"
                : s.status === "done"
                  ? "text-teal"
                  : "text-mute";
            return (
              <li key={s.phase + s.at} className="flex min-w-[120px] flex-col">
                <div className="flex items-center">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      s.status === "current"
                        ? "bg-tealhi pulse-dot"
                        : s.status === "done"
                          ? "bg-teal"
                          : "border border-mute bg-transparent"
                    }`}
                  />
                  {i < upcoming.length - 1 ? (
                    <span
                      className={`h-px flex-1 ${
                        s.status === "done" ? "bg-teal/60" : "bg-line"
                      }`}
                    />
                  ) : null}
                </div>
                <p className={`mt-1.5 pr-3 font-mono text-[10px] tracking-wider uppercase ${tone}`}>
                  {PHASE_NAME[s.phase]}
                </p>
                <p className="pr-3 text-[11px] text-dim">{s.label}</p>
                <p className="pr-3 font-mono text-[10px] text-mute">
                  {shortTime(s.at)}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </SpecCard>
  );
}
