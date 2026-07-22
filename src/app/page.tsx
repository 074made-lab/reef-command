import Link from "next/link";
import { Wordmark } from "@/components/chat/Header";
import { StoreTourBackdrop } from "@/components/home/StoreTourBackdrop";
import {
  PROJECT_AUTHOR,
  PROJECT_GITHUB_URL,
  PROJECT_LINKEDIN_URL,
} from "@/lib/project-credit";

const SURFACES = [
  {
    href: "/merchant",
    tag: "MERCHANT COCKPIT",
    line: "Run the auction week from one conversation: attention, merges, labels, and the report.",
    live: true,
  },
  {
    href: "/shop",
    tag: "CUSTOMER CONCIERGE",
    line: "Delivery loss gets a guided DOA form; everything else can hand off to the owner's cockpit.",
    live: false,
  },
];

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-abyss px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <StoreTourBackdrop />
        <div className="absolute inset-0 bg-abyss/30" />
      </div>

      {/* sonar rings */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="sonar-ring absolute h-[42rem] w-[42rem] rounded-full border border-teal/15"
            style={{ animationDelay: `${i * 1.33}s` }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center text-center drop-shadow-[0_3px_20px_rgba(2,10,14,.82)]">
        <p className="mb-4 font-mono text-[12px] tracking-[0.4em] text-mute uppercase">
          depth 04 · channel open
        </p>
        {/* Teddy at the center of the sonar, the store's real reef dog */}
        <img
          src="/teddy.jpg"
          alt="Teddy the reef dog, wearing his HAPPY REEFING headband in front of the coral tanks"
          width={132}
          height={132}
          className="coral-halo mb-6 rounded-full ring-2 ring-coral/70"
        />
        <Wordmark size="lg" />
        <p className="mt-5 max-w-xl text-[17px] font-medium leading-relaxed tracking-[-0.01em] text-ink drop-shadow-[0_2px_12px_rgba(2,10,14,.95)] sm:text-[19px]">
          Daily AI Assistant for Multi-Channel Coral Businesses
        </p>
        <p className="mt-2 font-mono text-[12px] tracking-[0.24em] text-coral uppercase">
          watched over by teddy · happy reefing
        </p>

        <div className="mt-10 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {SURFACES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-md border border-line/90 bg-panel/88 px-5 py-4 text-left shadow-[0_14px_38px_rgba(2,10,14,0.38)] backdrop-blur-sm transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-coral/55 hover:bg-raise/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/55"
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

        <p className="mt-12 bg-abyss/55 px-4 py-2 font-mono text-[11px] tracking-[0.18em] text-ink/85 uppercase shadow-[0_8px_24px_rgba(2,10,14,.28)] backdrop-blur-[3px] sm:text-[12px]">
          ClickHouse × Trigger.dev · Beyond the Wall of Text
        </p>
        <p className="mt-2 font-mono text-[10px] tracking-[0.12em] text-ink/70 drop-shadow-[0_1px_8px_rgba(2,10,14,.95)] sm:text-[11px]">
          Created by {PROJECT_AUTHOR}
          <span aria-hidden> · </span>
          <a
            href={PROJECT_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-coralhi focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/55"
          >
            GitHub
          </a>
          <span aria-hidden> · </span>
          <a
            href={PROJECT_LINKEDIN_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-coralhi focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/55"
          >
            LinkedIn
          </a>
        </p>
      </div>
    </main>
  );
}
