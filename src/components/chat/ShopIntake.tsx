"use client";

/**
 * The concierge answers one narrow, public-safe synthetic FAQ directly. A DOA
 * report goes to evidence intake; every other question lands as a `message_in`
 * event in the merchant cockpit. This never contacts a real customer.
 */
import { useState } from "react";
import Link from "next/link";
import { routeShopQuestion, SHOP_COMBINE_ANSWER } from "@/lib/shop-authority";

export function ShopIntake() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "answered" | "doa" | "error">("idle");
  const [note, setNote] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || state === "busy") return;
    setLastQuestion(q);
    const route = routeShopQuestion(q);
    if (route === "doa-claim") {
      setState("doa");
      setQuestion("");
      setNote("");
      return;
    }
    if (route === "direct-answer") {
      setState("answered");
      setQuestion("");
      setNote(SHOP_COMBINE_ANSWER);
      return;
    }
    setState("busy");
    setNote("");
    try {
      const res = await fetch("/api/shop/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setState("error");
        setNote(data.error ?? `failed (${res.status})`);
        return;
      }
      setState("sent");
      setQuestion("");
      setNote(
        "Landed in the owner's cockpit — open Merchant and ask “What needs my attention?” to see it arrive.",
      );
    } catch {
      setState("error");
      setNote("network error — try again");
    }
  }

  return (
    <div className="rounded-md border border-line bg-panel/85 p-3">
      <p className="mb-2 font-mono text-[11px] tracking-[0.18em] text-teal uppercase">
        ask the store — live
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={280}
          placeholder="e.g. Can you hold my box until next week's shipment?"
          aria-label="Your question for the store"
          className="min-w-0 flex-1 rounded-md border border-line bg-raise px-3.5 py-2.5 font-mono text-[13px] text-ink placeholder:text-mute focus:border-teal focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === "busy" || !question.trim()}
          className="rounded-md border border-coral/70 bg-coral/15 px-4 font-mono text-[12px] font-semibold tracking-widest text-coralhi transition-colors hover:bg-coral/25 disabled:opacity-40"
        >
          {state === "busy" ? "…" : "ASK ▸"}
        </button>
      </form>
      {state === "sent" ? (
        <p className="anim-rise mt-2 text-[12px] text-tealhi">✓ {note}</p>
      ) : null}
      {state === "answered" ? (
        <div className="anim-rise mt-3 rounded-md border border-teal/40 bg-teal/[0.06] p-3.5" aria-live="polite">
          <div className="flex items-start gap-2.5">
            <img
              src="/teddy-avatar.jpg"
              alt=""
              width={28}
              height={28}
              className="mt-0.5 shrink-0 rounded-full ring-1 ring-teal/60"
            />
            <div className="min-w-0">
              <p className="font-mono text-[12px] tracking-[0.14em] text-teal uppercase">
                Teddy answered · synthetic demo
              </p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink">{note}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mute">
                Asked: “{lastQuestion}”
              </p>
              <button
                type="button"
                onClick={() => {
                  setState("idle");
                  setLastQuestion("");
                  setNote("");
                }}
                className="mt-3 rounded-md border border-line px-3 py-2 font-mono text-[13px] text-dim transition-colors hover:border-teal/60 hover:text-tealhi"
              >
                ASK SOMETHING ELSE
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {state === "doa" ? (
        <div className="anim-rise mt-3 rounded-md border border-coral/40 bg-[linear-gradient(135deg,rgba(255,133,89,.08),rgba(15,168,150,.045))] p-3.5" aria-live="polite">
          <div className="flex items-start gap-2.5">
            <img
              src="/teddy-avatar.jpg"
              alt=""
              width={28}
              height={28}
              className="mt-0.5 shrink-0 rounded-full ring-1 ring-coral/60"
            />
            <div className="min-w-0">
              <p className="font-mono text-[13px] tracking-[0.16em] text-coralhi uppercase">
                Teddy found the right next step
              </p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink">
                I&apos;m sorry your coral didn&apos;t make it. Please open the DOA form and add a photo. The store team will review the claim within 24 hours.
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mute">
                Reported: “{lastQuestion}”
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href="/shop/doa-claim"
                  className="inline-flex items-center rounded-md border border-coral bg-coral px-3.5 py-2 font-mono text-[13px] font-semibold tracking-wide text-abyss transition-colors hover:bg-coralhi"
                >
                  OPEN DOA FORM ▸
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setState("idle");
                    setLastQuestion("");
                  }}
                  className="rounded-md border border-line px-3 py-2 font-mono text-[13px] text-dim transition-colors hover:border-teal/60 hover:text-tealhi"
                >
                  ASK SOMETHING ELSE
                </button>
              </div>
              <p className="mt-2.5 font-mono text-[12px] text-teal">
                ROBOT JOB: collect evidence · HUMAN JOB: decide the remedy
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {state === "error" ? (
        <p className="mt-2 text-[12px] text-danger">✕ {note}</p>
      ) : null}
      <p className="mt-2 text-[12px] leading-relaxed text-mute">
        Teddy answers the synthetic order-combining FAQ directly. Delivery loss
        opens the DOA path; other questions enter the owner&apos;s attention feed.
        This demo never contacts a real customer.
      </p>
    </div>
  );
}
