import Link from "next/link";
import { PhaseChip } from "./PhaseChip";

export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span
      className={`font-sans font-semibold tracking-[0.12em] whitespace-nowrap ${
        size === "lg" ? "text-4xl sm:text-6xl" : "text-[14px]"
      }`}
    >
      <span className="text-ink">CORAL</span>
      <span className="text-coral">SELLER</span>
    </span>
  );
}

export function Header({ surface }: { surface: "merchant" | "shop" }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-abyss/92 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          {/* Teddy — the store's real reef dog, the face of the cockpit */}
          <img
            src="/teddy-avatar.jpg"
            alt="Teddy, the reef co-pilot"
            width={26}
            height={26}
            className="rounded-md ring-1 ring-coral/55"
          />
          <Wordmark />
        </Link>
        <span className="hidden text-[13px] text-mute sm:inline">
          {surface === "merchant" ? "merchant cockpit" : "customer concierge"}
        </span>
        <nav className="ml-auto flex h-full items-center gap-5">
          <Link
            href="/merchant"
            className={`flex h-full items-center border-b-2 text-[13px] font-medium transition-colors ${
              surface === "merchant" ? "border-coral text-ink" : "border-transparent text-mute hover:text-ink"
            }`}
          >
            Merchant
          </Link>
          <Link
            href="/shop"
            className={`flex h-full items-center border-b-2 text-[13px] font-medium transition-colors ${
              surface === "shop" ? "border-coral text-ink" : "border-transparent text-mute hover:text-ink"
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
