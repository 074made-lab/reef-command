import Link from "next/link";
import { PhaseChip } from "./PhaseChip";

export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span
      className={`font-mono font-semibold tracking-[0.28em] whitespace-nowrap ${
        size === "lg" ? "text-4xl sm:text-6xl" : "text-[13px]"
      }`}
    >
      <span className="text-ink">REEF</span>
      <span aria-hidden className="text-coral">
        ▮
      </span>
      <span className="text-tealhi">COMMAND</span>
    </span>
  );
}

export function Header({ surface }: { surface: "merchant" | "shop" }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-abyss/85 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-4xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80">
          {/* Teddy — the store's real reef dog, the face of the cockpit */}
          <img
            src="/teddy-avatar.jpg"
            alt="Teddy, the reef co-pilot"
            width={26}
            height={26}
            className="rounded-full ring-1 ring-coral/60"
          />
          <Wordmark />
        </Link>
        <span className="hidden font-mono text-[12px] tracking-widest text-mute uppercase sm:inline">
          {surface === "merchant" ? "merchant cockpit" : "customer concierge"}
        </span>
        <nav className="ml-auto flex items-center gap-3">
          <Link
            href="/merchant"
            className={`font-mono text-[12px] tracking-widest uppercase ${
              surface === "merchant" ? "text-tealhi" : "text-mute hover:text-dim"
            }`}
          >
            Merchant
          </Link>
          <Link
            href="/shop"
            className={`font-mono text-[12px] tracking-widest uppercase ${
              surface === "shop" ? "text-tealhi" : "text-mute hover:text-dim"
            }`}
          >
            Shop
          </Link>
        </nav>
      </div>
      {surface === "merchant" ? <PhaseChip /> : null}
    </header>
  );
}
