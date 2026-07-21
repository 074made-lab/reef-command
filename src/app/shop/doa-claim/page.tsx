"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/chat/Header";

export default function DemoDoaClaimPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header surface="shop" />
      <main className="reef-room flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[13px] tracking-[0.16em] text-coralhi uppercase">DOA claim</p>
              <h1 className="mt-1 text-2xl font-semibold text-ink">Tell us what arrived</h1>
            </div>
            <span className="rounded-sm border border-warn/40 px-2 py-1 font-mono text-[12px] text-warn">SYNTHETIC DEMO</span>
          </div>

          {!submitted ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(true);
              }}
              className="space-y-4 rounded-lg border border-coral/30 bg-panel/85 p-4 shadow-[0_18px_55px_rgba(0,0,0,.25)]"
            >
              <p className="text-[14px] leading-relaxed text-dim">
                Add the order and a photo of the coral. Teddy collects the evidence;
                a store team member reviews every remedy.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-[13px] text-dim">
                  <span>Order number</span>
                  <input required placeholder="DEMO-1042" className="w-full rounded-md border border-line bg-raise px-3 py-2.5 text-[14px] text-ink outline-none focus:border-coral/70" />
                </label>
                <label className="space-y-1.5 text-[13px] text-dim">
                  <span>Email</span>
                  <input required type="email" placeholder="reefer@example.test" className="w-full rounded-md border border-line bg-raise px-3 py-2.5 text-[14px] text-ink outline-none focus:border-coral/70" />
                </label>
                <label className="space-y-1.5 text-[13px] text-dim sm:col-span-2">
                  <span>Coral</span>
                  <input required placeholder="Coral or frag name" className="w-full rounded-md border border-line bg-raise px-3 py-2.5 text-[14px] text-ink outline-none focus:border-coral/70" />
                </label>
                <label className="space-y-1.5 text-[13px] text-dim">
                  <span>Delivery date</span>
                  <input required type="date" className="w-full rounded-md border border-line bg-raise px-3 py-2.5 text-[14px] text-ink outline-none focus:border-coral/70" />
                </label>
                <label className="space-y-1.5 text-[13px] text-dim">
                  <span>Photo evidence</span>
                  <input required type="file" accept="image/*" className="w-full rounded-md border border-line bg-raise px-3 py-2 text-[13px] text-dim file:mr-2 file:rounded-sm file:border-0 file:bg-teal/10 file:px-2 file:py-1 file:text-tealhi" />
                </label>
              </div>
              <div className="rounded-sm border border-teal/30 bg-teal/[0.045] px-3 py-2 text-[13px] text-dim">
                No file or customer information is uploaded or stored by this demo.
              </div>
              <button type="submit" className="w-full rounded-md border border-coral bg-coral px-4 py-2.5 font-mono text-[13px] font-bold tracking-widest text-abyss transition-colors hover:bg-coralhi">
                SUBMIT DEMO CLAIM ▸
              </button>
            </form>
          ) : (
            <div className="anim-rise rounded-lg border border-teal/40 bg-panel/85 p-5 text-center shadow-[0_18px_55px_rgba(0,0,0,.25)]" aria-live="polite">
              <img src="/teddy-avatar.jpg" alt="" width={54} height={54} className="mx-auto rounded-full ring-2 ring-teal/50" />
              <p className="mt-3 font-mono text-[13px] tracking-[0.16em] text-tealhi uppercase">Evidence collected</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Human review required</h2>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-dim">
                Demo claim <span className="font-mono text-coralhi">DOA-DEMO-2401</span> is ready. The store team will review it within 24 hours. Teddy collected the evidence but did not choose a remedy.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link href="/shop" className="rounded-md border border-teal/50 px-3.5 py-2 font-mono text-[13px] text-tealhi hover:bg-teal/10">BACK TO SHOP</Link>
                <Link href="/merchant" className="rounded-md border border-coral/60 bg-coral/10 px-3.5 py-2 font-mono text-[13px] text-coralhi hover:bg-coral/20">VIEW HUMAN QUEUE ▸</Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
