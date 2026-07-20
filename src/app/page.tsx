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
    line: "Order tracking, DOA claims, add-ons for buyers. Opens tomorrow.",
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
        <p className="mb-4 font-mono text-[10px] tracking-[0.4em] text-mute uppercase">
          depth 04 · channel open
        </p>
        <Wordmark size="lg" />
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-dim">
          One week of a coral business, run from one chat window.
        </p>

        <div className="mt-10 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {SURFACES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-md border border-line bg-panel/80 px-5 py-4 text-left transition-colors hover:border-teal/60"
            >
              <p className="flex items-center justify-between font-mono text-[11px] tracking-[0.2em] text-tealhi">
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
              <p className="mt-2 font-mono text-[10px] tracking-widest text-mute">
                {s.live ? "LIVE" : "TOMORROW"}
              </p>
            </Link>
          ))}
        </div>

        <p className="mt-12 font-mono text-[10px] tracking-[0.25em] text-mute uppercase">
          ClickHouse × Trigger.dev · Beyond the Wall of Text
        </p>
      </div>
    </main>
  );
}
