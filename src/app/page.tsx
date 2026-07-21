import Link from "next/link";
import { Wordmark } from "@/components/chat/Header";

const SURFACES = [
  {
    href: "/merchant",
    tag: "MERCHANT COCKPIT",
    line: "Run the auction week from one conversation — attention, merges, labels, the report.",
    live: true,
  },
  {
    href: "/shop",
    tag: "CUSTOMER CONCIERGE",
    line: "Ask the store live — questions land in the owner's cockpit. Component answers open next.",
    live: false,
  },
];

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
      {/* sonar rings */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="sonar-ring absolute h-[42rem] w-[42rem] rounded-full border border-teal/25"
            style={{ animationDelay: `${i * 1.33}s` }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center text-center">
        <p className="mb-4 font-mono text-[12px] tracking-[0.4em] text-mute uppercase">
          depth 04 · channel open
        </p>
        {/* Teddy at the center of the sonar — the store's real reef dog */}
        <img
          src="/teddy.jpg"
          alt="Teddy the reef dog, wearing his HAPPY REEFING headband in front of the coral tanks"
          width={132}
          height={132}
          className="coral-halo mb-6 rounded-full ring-2 ring-coral/70"
        />
        <Wordmark size="lg" />
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-dim">
          One week of a coral business, run from one chat window.
        </p>
        <p className="mt-2 font-mono text-[12px] tracking-[0.24em] text-coral uppercase">
          watched over by teddy · happy reefing
        </p>

        <div className="mt-10 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {SURFACES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-md border border-line bg-panel/80 px-5 py-4 text-left shadow-[0_14px_38px_rgba(0,0,0,0.18)] transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-coral/55 hover:bg-raise/85"
            >
              <p className="flex items-center justify-between font-mono text-[12px] tracking-[0.2em] text-tealhi">
                {s.tag}
                <span
                  className={`transition-transform group-hover:translate-x-0.5 ${
                    s.live ? "text-coralhi" : "text-mute"
                  }`}
                  aria-hidden
                >
                  ▸
                </span>
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-dim">{s.line}</p>
              <p className="mt-2 font-mono text-[12px] tracking-widest text-mute">
                {s.live ? "LIVE" : "PREVIEW"}
              </p>
            </Link>
          ))}
        </div>

        <p className="mt-12 font-mono text-[12px] tracking-[0.25em] text-mute uppercase">
          ClickHouse × Trigger.dev · Beyond the Wall of Text
        </p>
      </div>
    </main>
  );
}
