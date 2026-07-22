"use client";

import { useEffect, useMemo, useState } from "react";
import { getOwnerAuthState } from "@/app/actions";
import type { DoaReviewPlan } from "@/lib/protocol";
import { Chip, PlatformChip } from "./bits";

type WorkflowStatus =
  | "idle"
  | "starting"
  | "approval-recorded"
  | "replacements-recorded"
  | "old-label-voided"
  | "packing-list-ready"
  | "updated-label-purchased"
  | "reply-draft-ready"
  | "completed"
  | "failed";

type Auth = { configured: boolean; authenticated: boolean };

const STEPS = [
  { status: "approval-recorded", label: "Owner decision recorded" },
  { status: "replacements-recorded", label: "3 replacements added" },
  { status: "old-label-voided", label: "Old label voided" },
  { status: "packing-list-ready", label: "Packing list rebuilt" },
  { status: "updated-label-purchased", label: "Updated label purchased" },
  { status: "reply-draft-ready", label: "Customer reply draft ready" },
] as const;

const STATUS_INDEX = new Map<string, number>(STEPS.map((step, index) => [step.status, index]));

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function completedSteps(status: WorkflowStatus): number {
  if (status === "completed") return STEPS.length;
  const index = STATUS_INDEX.get(status);
  return index === undefined ? 0 : index + 1;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md border border-line/70 bg-abyss/45 px-2.5 py-2">
      <p className="font-mono text-[17px] tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-[12px] leading-tight text-mute">{label}</p>
    </div>
  );
}

function ProgressRing({ done }: { done: number }) {
  const pct = Math.round((done / STEPS.length) * 100);
  return (
    <div
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(var(--color-coral) ${pct}%, rgba(33,65,74,.6) ${pct}% 100%)` }}
      aria-label={`${pct}% complete`}
    >
      <div className="grid h-9 w-9 place-items-center rounded-full bg-panel font-mono text-[12px] text-coralhi">
        {pct}%
      </div>
    </div>
  );
}

export function DoaReview({ plan, onResolved }: { plan: DoaReviewPlan; onResolved: () => void }) {
  const [status, setStatus] = useState<WorkflowStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [auth, setAuth] = useState<Auth | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [pass, setPass] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [reply, setReply] = useState(plan.replyDraft);
  const done = completedSteps(status);
  const finished = status === "completed";
  const busy = status === "starting" || (status !== "idle" && status !== "completed" && status !== "failed");

  useEffect(() => {
    let live = true;
    getOwnerAuthState().then((value) => { if (live) setAuth(value); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!runId || status === "completed" || status === "failed") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reads = 0;
    let polls = 0;
    const poll = async () => {
      if (!live) return;
      // Healthy-but-stuck runs must fail visibly too (e.g. the Trigger worker
      // is down and the run never executes): cap total polls, mirroring the
      // ship-day alert and label-chip bounds.
      polls += 1;
      if (polls > 90) {
        setStatus("failed");
        setNote("The workflow did not report progress. Check the Trigger worker, then approve again.");
        return;
      }
      try {
        const response = await fetch(`/api/demo/doa-resolution?runId=${encodeURIComponent(runId)}`);
        const body = await response.json() as {
          ok?: boolean;
          status?: string;
          failed?: boolean;
          error?: string;
        };
        if (!response.ok || !body.ok) {
          if (response.status === 401) {
            setAuth((current) => current ? { ...current, authenticated: false } : current);
          }
          throw new Error(body.error ?? "could not read workflow");
        }
        const next = body.failed ? "failed" : body.status;
        if (next && ["approval-recorded", "replacements-recorded", "old-label-voided", "packing-list-ready", "updated-label-purchased", "reply-draft-ready", "completed", "failed"].includes(next)) {
          setStatus(next as WorkflowStatus);
          if (next === "completed") {
            setNote("Closed loop verified in Postgres, ClickHouse, and the Trigger.dev trace.");
            onResolved();
            return;
          }
          if (next === "failed") {
            setNote("Workflow stopped safely. No customer reply was sent.");
            return;
          }
        }
      } catch (error) {
        reads += 1;
        if (reads >= 5) {
          setStatus("failed");
          setNote(error instanceof Error ? error.message : "workflow polling failed");
          return;
        }
      }
      timer = setTimeout(() => { void poll(); }, 650);
    };
    void poll();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [onResolved, runId, status]);

  const history = useMemo(() => [
    [plan.history.orders, "orders"],
    [plan.history.coralItems, "coral items"],
    [plan.history.priorDoa, "prior DOA"],
    [plan.history.priorRefunds, "refunds"],
    [plan.history.priorCredits, "store credit"],
    [plan.history.priorReplacements, "replacements"],
  ] as const, [plan.history]);

  async function startResolution() {
    if (busy || finished) return;
    if (auth && !auth.configured) return;
    if (auth && !auth.authenticated) {
      setUnlocking(true);
      return;
    }
    setStatus("starting");
    setNote("");
    try {
      const response = await fetch("/api/demo/doa-resolution", { method: "POST" });
      const body = await response.json() as { ok?: boolean; runId?: string; error?: string };
      if (!response.ok || !body.ok || !body.runId) {
        if (response.status === 401) {
          setAuth((current) => current ? { ...current, authenticated: false } : current);
          setUnlocking(true);
          setStatus("idle");
          return;
        }
        if (response.status === 503) setAuth({ configured: false, authenticated: false });
        throw new Error(body.error ?? "could not start resolution");
      }
      setRunId(body.runId);
      setStatus("approval-recorded");
    } catch (error) {
      setStatus("failed");
      setNote(error instanceof Error ? error.message : "could not start resolution");
    }
  }

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!pass || unlockBusy) return;
    setUnlockBusy(true);
    setUnlockError("");
    try {
      const response = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: pass }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "unlock failed");
      setAuth({ configured: true, authenticated: true });
      setUnlocking(false);
      setPass("");
      setNote("Unlocked. Review the scope, then click Approve once.");
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : "unlock failed");
    } finally {
      setUnlockBusy(false);
    }
  }

  return (
    <div className="border-t border-line/70 bg-[linear-gradient(135deg,rgba(255,133,89,.045),rgba(72,175,166,.025))] p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] tracking-[0.12em] text-coralhi">{plan.caseId}</span>
            <Chip className="border-warn/40 text-warn">SYNTHETIC</Chip>
            <Chip className="border-teal/40 text-teal">{plan.reviewWindow}</Chip>
          </div>
          <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.01em] text-ink">
            Tomorrow&apos;s shipment can absorb all 3 replacements
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-dim">
            Eligibility is a human decision. The customer band below is context only.
          </p>
        </div>
        {status !== "idle" ? <ProgressRing done={done} /> : null}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.08fr_.92fr]">
        <section className="rounded-lg border border-line/80 bg-panel/75 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-ink">{plan.customer.displayName}</span>
            <Chip className="border-teal/45 text-tealhi">BAND {plan.customer.band} · DISPLAY ONLY</Chip>
            {plan.customer.platforms.map((platform) => <PlatformChip key={platform} p={platform} />)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {history.map(([value, label]) => <Stat key={label} value={value} label={label} />)}
          </div>
          <div className="mt-3 border-t border-line/60 pt-3">
            <p className="text-[12px] font-semibold tracking-[0.08em] text-mute uppercase">Evidence assembled</p>
            <ul className="mt-2 grid gap-1.5 text-[13px] text-dim sm:grid-cols-3">
              {plan.evidence.map((entry) => (
                <li key={entry.label} className="rounded-md border border-line/65 bg-abyss/35 px-2.5 py-2">
                  <span className="text-ok">✓</span> <span className="text-ink">{entry.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-mute">{entry.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-lg border border-coral/30 bg-panel/85 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[12px] font-semibold tracking-[0.08em] text-coral uppercase">Ships {plan.shipment.shipWhen}</p>
              <p className="mt-1 font-mono text-[14px] text-ink">{plan.shipment.orderId}</p>
            </div>
            <Chip className="border-ok/40 text-ok">LABEL PURCHASED</Chip>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-line/70 bg-abyss/45 p-2.5 text-center">
            <div><strong className="font-mono text-[20px] text-ink">{plan.shipment.existingItems}</strong><span className="block text-[12px] text-mute">packed items</span></div>
            <span className="text-coral">+3 →</span>
            <div><strong className="font-mono text-[20px] text-coralhi">{plan.shipment.existingItems + plan.claimedItems.length}</strong><span className="block text-[12px] text-mute">updated list</span></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-md border border-danger/30 bg-danger/[0.035] p-2">
              <p className="text-mute">VOID OLD</p>
              <p className="mt-1 font-mono text-danger">{plan.shipment.currentLabelId}</p>
              <p className="font-mono text-dim">{usd(plan.shipment.currentLabelCostCents)}</p>
            </div>
            <div className="rounded-md border border-ok/30 bg-ok/[0.035] p-2">
              <p className="text-mute">ISSUE UPDATED</p>
              <p className="mt-1 font-mono text-ok">{plan.shipment.updatedLabelId}</p>
              <p className="font-mono text-dim">{usd(plan.shipment.updatedLabelCostCents)}</p>
            </div>
          </div>

          {status === "idle" || status === "failed" ? (
            <button
              type="button"
              onClick={() => { void startResolution(); }}
              disabled={auth?.configured === false}
              className="mt-3 w-full rounded-md border border-coral bg-coral px-3 py-2.5 text-[13px] font-semibold text-abyss transition-[background-color,transform] hover:bg-coralhi active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
            >
              APPROVE 3 REPLACEMENTS + {usd(plan.shipment.updatedLabelCostCents)} LABEL ▸
            </button>
          ) : null}
          {auth?.configured === false ? (
            <p className="mt-2 text-[12px] text-warn">Set REEF_OWNER_TOKEN to enable this human-gated action.</p>
          ) : null}
          {unlocking ? (
            <form onSubmit={unlock} className="mt-3 flex flex-wrap gap-2">
              <input
                type="password"
                value={pass}
                onChange={(event) => setPass(event.target.value)}
                placeholder="owner passphrase"
                aria-label="Owner passphrase"
                className="min-w-0 flex-1 rounded-md border border-line bg-abyss px-3 py-2 text-[13px] text-ink outline-none focus:border-coral/70"
              />
              <button type="submit" disabled={!pass || unlockBusy} className="rounded-md border border-coral/65 px-3 py-2 font-mono text-[13px] text-coralhi disabled:opacity-45">
                {unlockBusy ? "UNLOCKING…" : "UNLOCK"}
              </button>
              {unlockError ? <p className="w-full text-[12px] text-danger">{unlockError}</p> : null}
            </form>
          ) : null}
        </section>
      </div>

      {status !== "idle" ? (
        <section className="mt-3 rounded-lg border border-line/75 bg-panel/75 p-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold tracking-[0.08em] text-teal uppercase">Live workflow</p>
            <span className="font-mono text-[12px] text-mute">TRIGGER.DEV · POSTGRES · CLICKHOUSE</span>
          </div>
          <ol className="mt-2 grid gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {STEPS.map((step, index) => {
              const complete = index < done;
              const current = index === done && !finished && status !== "failed";
              return (
                <li key={step.status} className={`rounded-md border px-2 py-2 text-[12px] leading-snug ${complete ? "border-ok/35 bg-ok/[0.045] text-ok" : current ? "border-coral/45 bg-coral/[0.055] text-coralhi" : "border-line/65 text-mute"}`}>
                  <span className="mr-1 font-mono">{complete ? "✓" : current ? "↗" : "○"}</span>{step.label}
                </li>
              );
            })}
          </ol>
          {note ? <p className={`mt-2 text-[12px] ${status === "failed" ? "text-danger" : "text-tealhi"}`}>{note}</p> : null}
        </section>
      ) : null}

      {finished ? (
        <section className="mt-3 rounded-lg border border-teal/35 bg-teal/[0.035] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-semibold tracking-[0.08em] text-teal uppercase">Reply draft · ready for review</p>
            <Chip className="border-warn/40 text-warn">NOT SENT</Chip>
          </div>
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={3}
            aria-label="Editable DOA customer reply draft"
            className="mt-2 w-full resize-y rounded-md border border-line bg-abyss/60 px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none focus:border-teal/65"
          />
        </section>
      ) : null}
    </div>
  );
}
