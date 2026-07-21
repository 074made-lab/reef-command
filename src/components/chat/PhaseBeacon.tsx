"use client";

import { useEffect } from "react";
import type { WeekPhase } from "@/lib/protocol";
import { DEMO_PHASE_EVENT } from "@/lib/demo-clock";

/** Keeps the header clock aligned with the visual component currently shown. */
export function PhaseBeacon({ phase }: { phase: WeekPhase }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(DEMO_PHASE_EVENT, { detail: phase }));
  }, [phase]);
  return null;
}
