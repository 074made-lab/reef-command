/** Hour-by-hour arrival temps for a destination and the pack policy verdict.
 *  Live animals: out-of-band hours are the alert color. */

import type { HourTemp, PackVerdict } from "@/lib/protocol";
import { Chip, SpecCard } from "./bits";

export function WeatherStrip({
  destination,
  hours,
  policy,
}: {
  destination: string;
  hours: HourTemp[];
  policy: PackVerdict;
}) {
  const temps = hours.map((h) => h.tempF);
  const min = Math.min(...temps, 0);
  const max = Math.max(...temps, 1);
  const span = max - min || 1;
  return (
    <SpecCard
      tag="WEATHER"
      right={
        <span className="flex items-center gap-2">
          {policy.pack !== "none" ? (
            <Chip
              className={
                policy.pack === "heat"
                  ? "border-coral/50 text-coralhi"
                  : "border-tealhi/50 text-tealhi"
              }
            >
              {policy.pack.toUpperCase()} PACK
            </Chip>
          ) : null}
          <Chip
            className={policy.ship ? "border-ok/40 text-ok" : "border-danger/40 text-danger"}
          >
            {policy.ship ? "SHIP" : "HOLD"}
          </Chip>
        </span>
      }
    >
      <p className="text-sm text-ink">
        {destination}
        <span className="ml-2 text-[12px] text-dim">{policy.reason}</span>
      </p>
      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex min-w-max items-end gap-1">
          {hours.map((h) => {
            const hgt = 14 + ((h.tempF - min) / span) * 34;
            return (
              <div key={h.hour} className="flex w-9 flex-col items-center gap-1">
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    h.ok ? "text-dim" : "text-danger"
                  }`}
                >
                  {Math.round(h.tempF)}°
                </span>
                <div
                  className={`w-5 rounded-t-[4px] ${h.ok ? "bg-teal/70" : "bg-danger/80"}`}
                  style={{ height: `${hgt}px` }}
                  title={`${h.hour}: ${h.tempF}°F`}
                />
                <span className="font-mono text-[9px] text-mute">
                  {h.hour.length > 5 ? h.hour.slice(11, 16) : h.hour}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </SpecCard>
  );
}
