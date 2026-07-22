"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DemoResetControl() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-coral/45 bg-coral/8 px-2 py-1" role="group" aria-label="Confirm demo reset">
        <span className="hidden text-[11px] leading-none text-dim md:inline">Return to Sunday 0/3?</span>
        <button
          type="button"
          onClick={() => {
            // One-shot intent: /merchant/reset only auto-runs when reached
            // through this confirmed control — never from history/back-button.
            window.sessionStorage.setItem("reef-command:reset-intent", "1");
            router.push("/merchant/reset");
          }}
          className="rounded-sm bg-coral px-2 py-1 text-[10px] font-bold tracking-[0.06em] text-abyss uppercase transition-opacity hover:opacity-90"
        >
          Reset now
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="px-1 py-1 text-[10px] font-semibold tracking-[0.06em] text-mute uppercase hover:text-ink"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md border border-line bg-abyss/45 px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.08em] text-mute uppercase transition-colors hover:border-coral/55 hover:text-coral"
      aria-label="Reset the synthetic demo"
    >
      ↺ Reset demo
    </button>
  );
}
