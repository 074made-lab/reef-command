import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/chat/Header";
import { ShopIntake } from "@/components/chat/ShopIntake";
import { SpecRenderer } from "@/components/specs/SpecRenderer";

export const metadata: Metadata = {
  title: "Reef Command — Customer Concierge",
};

/**
 * The concierge INTAKE is live: a buyer's question writes a `message_in` event
 * to the shared store and surfaces in the merchant cockpit's attention feed —
 * both surfaces provably speak one component protocol. The ANSWER side stays an
 * explicit preview (the documented scope decision — see docs/DESIGN.md): no
 * fake composer pretending to chat back; a human reads and answers.
 */
export default function ShopPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header surface="shop" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
          <div className="flex items-center gap-2.5 rounded-sm border border-coral/40 bg-coral/[0.07] px-3 py-2">
            <img
              src="/teddy-avatar.jpg"
              alt=""
              width={24}
              height={24}
              className="shrink-0 rounded-full ring-1 ring-coral/50"
            />
            <p className="text-[13px] text-ink">
              <span className="mr-2 font-mono text-[11px] tracking-[0.18em] text-coralhi uppercase">
                customer concierge
              </span>
              Ask the store below — your question lands live in the owner&apos;s
              cockpit. Component answers here are the next surface.
            </p>
          </div>

          <ShopIntake />

          <SpecRenderer
            spec={{
              kind: "verdict_card",
              verdict:
                "This is the customer-facing side of the same chat protocol. When it opens, buyers track combined shipments, file DOA claims with photo evidence, and add corals to an open box — all as components, never a wall of text.",
              confidence: "high",
              evidence: [
                {
                  label: "order tracking",
                  detail: "live timeline of your combined shipment",
                },
                {
                  label: "DOA claims",
                  detail: "guided evidence intake, human decides",
                },
                {
                  label: "add-on window",
                  detail: "one shipping fee covers everything in the box",
                },
              ],
            }}
          />

          <div className="pt-2 text-center">
            <p className="text-sm text-dim">
              Today, the live product is the owner&apos;s side — run the whole
              week from the cockpit.
            </p>
            <Link
              href="/merchant"
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-teal/60 bg-teal/10 px-4 py-2 font-mono text-[12px] font-semibold tracking-widest text-tealhi uppercase transition-colors hover:bg-teal/20"
            >
              Open the merchant cockpit ▸
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
