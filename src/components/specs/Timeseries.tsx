"use client";

/** Hand-rolled SVG line/area chart with crosshair + tooltip.
 *  Series 1 = phosphor teal, series 2 = coral (validated pair). ≥2 series
 *  get a legend; a single series is named by the title. */

import { useRef, useState } from "react";
import type { Annotation, Series } from "@/lib/protocol";
import { SpecCard } from "./bits";
import { num, shortTime } from "./format";

const W = 640;
const H = 210;
const PAD = { l: 46, r: 10, t: 12, b: 24 };
const STROKES = ["var(--color-teal)", "var(--color-coral)"];

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const m = v / pow;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nice * pow;
}

const parseT = (t: string) =>
  new Date(t.includes("T") ? t : t.replace(" ", "T") + "Z").getTime();

export function Timeseries({
  title,
  series,
  annotations,
}: {
  title: string;
  series: Series[];
  annotations?: Annotation[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const drawn = series.filter((s) => s.points.length > 0);
  if (!drawn.length) {
    return (
      <SpecCard tag="TIMESERIES">
        <p className="text-sm text-dim">{title}</p>
        <p className="mt-2 font-mono text-xs text-mute">
          no events in this window yet
        </p>
      </SpecCard>
    );
  }

  const times = drawn.flatMap((s) => s.points.map((p) => parseT(p.t)));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const tSpan = t1 - t0 || 1;
  const vMax = niceCeil(Math.max(...drawn.flatMap((s) => s.points.map((p) => p.v))));

  const x = (t: number) => PAD.l + ((t - t0) / tSpan) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / vMax) * (H - PAD.t - PAD.b);

  // hover follows the densest series
  const main = drawn.reduce((a, b) => (b.points.length > a.points.length ? b : a));

  function onMove(e: React.PointerEvent) {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    main.points.forEach((p, i) => {
      const d = Math.abs(x(parseT(p.t)) - svgX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  const hoverPt = hover !== null ? main.points[hover] : null;
  const hoverX = hoverPt ? x(parseT(hoverPt.t)) : 0;

  return (
    <SpecCard
      tag="TIMESERIES"
      right={
        drawn.length >= 2 ? (
          <span className="flex items-center gap-3">
            {drawn.map((s, i) => (
              <span
                key={s.name}
                className="flex items-center gap-1.5 font-mono text-[10px] text-dim"
              >
                <span
                  className="inline-block h-[3px] w-3 rounded-full"
                  style={{ background: STROKES[i % STROKES.length] }}
                />
                {s.name}
              </span>
            ))}
          </span>
        ) : undefined
      }
    >
      <p className="mb-2 text-sm text-dim">{title}</p>
      <div
        ref={wrap}
        className="relative"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={title}>
          <defs>
            <linearGradient id="rc-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-teal)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-teal)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* recessive grid: 0 / half / max */}
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(vMax * f)}
                y2={y(vMax * f)}
                stroke="var(--color-line)"
                strokeWidth="1"
                strokeDasharray={f === 0 ? undefined : "2 4"}
              />
              <text
                x={PAD.l - 6}
                y={y(vMax * f) + 3}
                textAnchor="end"
                fill="var(--color-mute)"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {num(vMax * f)}
              </text>
            </g>
          ))}

          {/* annotations */}
          {annotations?.map((a) => {
            const at = parseT(a.t);
            if (at < t0 || at > t1) return null;
            return (
              <g key={a.t + a.label}>
                <line
                  x1={x(at)}
                  x2={x(at)}
                  y1={PAD.t}
                  y2={H - PAD.b}
                  stroke="var(--color-coral)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.7"
                />
                <text
                  x={x(at) + 4}
                  y={PAD.t + 9}
                  fill="var(--color-coralhi)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {a.label}
                </text>
              </g>
            );
          })}

          {/* area under first series + 2px lines */}
          {drawn.map((s, i) => {
            const pts = s.points.map((p) => `${x(parseT(p.t))},${y(p.v)}`);
            return (
              <g key={s.name}>
                {i === 0 && s.points.length > 1 ? (
                  <polygon
                    points={`${PAD.l},${y(0)} ${pts.join(" ")} ${x(
                      parseT(s.points[s.points.length - 1].t),
                    )},${y(0)}`}
                    fill="url(#rc-area)"
                  />
                ) : null}
                <polyline
                  points={pts.join(" ")}
                  fill="none"
                  stroke={STROKES[i % STROKES.length]}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* crosshair */}
          {hoverPt ? (
            <g>
              <line
                x1={hoverX}
                x2={hoverX}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="var(--color-tealhi)"
                strokeWidth="1"
                opacity="0.5"
              />
              <circle
                cx={hoverX}
                cy={y(hoverPt.v)}
                r="3.5"
                fill="var(--color-tealhi)"
                stroke="var(--color-panel)"
                strokeWidth="2"
              />
            </g>
          ) : null}

          {/* x labels: ends only */}
          <text
            x={PAD.l}
            y={H - 7}
            fill="var(--color-mute)"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            {shortTime(main.points[0].t)}
          </text>
          <text
            x={W - PAD.r}
            y={H - 7}
            textAnchor="end"
            fill="var(--color-mute)"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            {shortTime(main.points[main.points.length - 1].t)}
          </text>
        </svg>

        {hoverPt ? (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-sm border border-line bg-raise px-2 py-1 font-mono text-[10px] whitespace-nowrap"
            style={{
              left: `${Math.min(Math.max((hoverX / W) * 100, 12), 88)}%`,
            }}
          >
            <span className="text-mute">{shortTime(hoverPt.t)}</span>{" "}
            <span className="text-tealhi tabular-nums">{num(hoverPt.v)}</span>{" "}
            <span className="text-dim">{main.name}</span>
          </div>
        ) : null}
      </div>
    </SpecCard>
  );
}
