"use client";

/** Executable action chips. `gated` = human-only click (coral); `auto` (teal).
 *  Clicking POSTs to /api/actions. The label-batch approval is owner-gated: the
 *  chip loads owner-auth state, and if the caller has no owner session it prompts
 *  for the passphrase INLINE (never gating the rest of the cockpit — R3-P1
 *  rescope), then — on unlock — asks the owner to click Approve again rather than
 *  auto-buying. If REEF_OWNER_TOKEN isn't configured the chip is disabled with a
 *  setup hint. On approval it POLLS the durable run and streams real progress —
 *  "purchasing 1/N → purchased" — so the OLTP+OLAP loop closes on screen. Other
 *  unwired actions surface the honest 501, never a fake success. */

import { useEffect, useState } from "react";
import type { ActionChip } from "@/lib/protocol";
import { getLabelRunProgress, getOwnerAuthState } from "@/app/actions";

type Progress = { status: string; failed: boolean; purchased: number; shipments: number; totalCostCents: number };
type Auth = { configured: boolean; authenticated: boolean };

function usd(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function ChipButton({ chip }: { chip: ActionChip }) {
  const [state, setState] = useState<"idle" | "busy" | "running" | "done" | "error" | "stalled">("idle");
  const [note, setNote] = useState("");
  const [prog, setProg] = useState<Progress | null>(null);

  const isApproval = chip.taskId === "approve-label-batch";
  const runId = typeof chip.payload?.runId === "string" ? chip.payload.runId : null;

  // Owner-auth state (approval chip only): drives disabled/unlock/go.
  const [auth, setAuth] = useState<Auth | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [pass, setPass] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockErr, setUnlockErr] = useState("");

  useEffect(() => {
    if (!isApproval) return;
    let live = true;
    getOwnerAuthState().then((a) => { if (live) setAuth(a); }).catch(() => {});
    return () => { live = false; };
  }, [isApproval]);

  async function pollRun(id: string) {
    // Watch the run to completion (fast — purchases stream in). Bounded.
    for (let i = 0; i < 60; i++) {
      let p: Progress;
      try {
        p = await getLabelRunProgress(id);
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      setProg(p);
      if (p.status === "purchased") {
        setState("done");
        setNote(`purchased ${p.purchased}/${p.shipments} labels · ${usd(p.totalCostCents)} — Postgres rows + ClickHouse events written`);
        return;
      }
      if (p.failed) {
        // A crashed/failed run is an error, never a green ✓ (R3-P1).
        setState("error");
        setNote("run failed — check the Trigger dashboard");
        return;
      }
      if (p.status === "declined" || p.status === "empty") {
        setState("error");
        setNote(p.status === "empty" ? "nothing to ship" : "declined");
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    // Out of poll budget with no terminal state — neutral, NOT a success.
    setState("stalled");
    setNote("still finishing — check the Trigger dashboard");
  }

  async function fire() {
    if (state === "busy" || state === "running" || state === "done") return;
    // Approval gating happens client-side first so the owner sees the right
    // affordance; the server still enforces it (requireOwner).
    if (isApproval && auth) {
      if (!auth.configured) return;                       // disabled
      if (!auth.authenticated) { setUnlocking(true); return; } // unlock first
    }
    setState("busy");
    setNote("");
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId: chip.taskId, payload: chip.payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (isApproval && res.status === 401) {           // session lost/expired
          setState("idle");
          setAuth((a) => (a ? { ...a, authenticated: false } : a));
          setUnlocking(true);
          return;
        }
        if (isApproval && res.status === 503) {           // token not configured
          setState("idle");
          setAuth({ configured: false, authenticated: false });
          return;
        }
        setState("error");
        setNote(data.error ?? `action failed (${res.status})`);
        return;
      }
      if (isApproval && runId) {
        setState("running");
        setNote("approved — buying labels…");
        void pollRun(runId);
      } else {
        setState("done");
        setNote("done");
      }
    } catch {
      setState("error");
      setNote("network error — try again");
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (unlockBusy || !pass) return;
    setUnlockBusy(true);
    setUnlockErr("");
    try {
      const res = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: pass }),
      });
      if (res.ok) {
        setAuth({ configured: true, authenticated: true });
        setUnlocking(false);
        setPass("");
        setState("idle");
        setNote("Unlocked — click Approve again"); // deliberate: never auto-buy
        return;
      }
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 503) {
        setAuth({ configured: false, authenticated: false });
        setUnlocking(false);
        return;
      }
      setUnlockErr(d.error ?? "sign-in failed");
    } catch {
      setUnlockErr("network error");
    } finally {
      setUnlockBusy(false);
    }
  }

  const gated = chip.risk === "gated";
  const base =
    "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[12px] tracking-wide transition-colors disabled:opacity-60";
  const tone = gated
    ? "border-coral/60 text-coralhi hover:bg-coral/10"
    : "border-teal/60 text-tealhi hover:bg-teal/10";

  const running = state === "running";
  const unconfigured = isApproval && auth !== null && !auth.configured;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={fire}
        disabled={state === "busy" || running || state === "done" || state === "stalled" || unconfigured}
        className={`${base} ${tone}`}
      >
        {gated ? (
          <span className="rounded-[2px] bg-coral/20 px-1 text-[11px] text-coralhi">GATED</span>
        ) : null}
        {chip.label}
        <span aria-hidden>▸</span>
      </button>
      {state === "busy" ? <span className="font-mono text-[12px] text-mute">sending…</span> : null}
      {running ? (
        <span className="anim-rise font-mono text-[12px] text-tealhi">
          {prog && prog.status === "purchasing"
            ? `▸ purchasing ${prog.purchased}/${prog.shipments}…`
            : note || "approved — buying labels…"}
        </span>
      ) : null}
      {state === "done" ? (
        <span className="anim-rise font-mono text-[12px] text-ok">✓ {note}</span>
      ) : null}
      {state === "stalled" ? (
        <span className="font-mono text-[12px] text-mute">⋯ {note}</span>
      ) : null}
      {state === "error" ? (
        <span className="font-mono text-[12px] text-danger">✕ {note}</span>
      ) : null}
      {state === "idle" && note ? (
        <span className="font-mono text-[12px] text-tealhi">{note}</span>
      ) : null}
      {unconfigured ? (
        <span className="font-mono text-[12px] text-warn">set REEF_OWNER_TOKEN to enable gated actions</span>
      ) : null}
      {unlocking ? (
        <form onSubmit={unlock} className="inline-flex flex-wrap items-center gap-1.5">
          <input
            type="password"
            autoComplete="current-password"
            aria-label="Owner passphrase"
            placeholder="owner passphrase"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            disabled={unlockBusy}
            className="rounded-sm border border-line bg-raise px-2 py-1 text-[12px] text-ink outline-none focus:border-tealhi/70 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={unlockBusy || !pass}
            className="inline-flex items-center rounded-sm border border-coral/60 px-2 py-1 font-mono text-[12px] text-coralhi hover:bg-coral/10 disabled:opacity-60"
          >
            {unlockBusy ? "unlocking…" : "Unlock"}
          </button>
          {unlockErr ? <span className="font-mono text-[12px] text-danger">✕ {unlockErr}</span> : null}
        </form>
      ) : null}
    </span>
  );
}

export function ActionRow({ actions }: { actions?: ActionChip[] }) {
  if (!actions?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-2.5">
      {actions.map((a) => (
        <ChipButton key={a.taskId + a.label} chip={a} />
      ))}
    </div>
  );
}
