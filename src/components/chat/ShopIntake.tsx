"use client";

/**
 * The concierge's LIVE intake. A buyer types a question; it lands as a
 * `message_in` event in the shared store, and the merchant cockpit's attention
 * feed surfaces it as an unanswered message — the on-camera proof that both
 * surfaces speak one protocol. Answers stay human/preview; this never sends
 * anything to a real customer.
 */
import { useState } from "react";

export function ShopIntake() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [note, setNote] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || state === "busy") return;
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
      {state === "error" ? (
        <p className="mt-2 text-[12px] text-danger">✕ {note}</p>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-mute">
        Your question goes straight into the owner&apos;s attention feed as an
        unanswered message — a human reads and answers it. Nothing is auto-sent.
      </p>
    </div>
  );
}
