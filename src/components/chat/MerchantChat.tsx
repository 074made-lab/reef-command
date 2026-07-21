"use client";

/**
 * Merchant cockpit chat — backed by the durable Trigger.dev `chat.agent()`
 * ("reef-chat") through `useTriggerChatTransport`. History accumulates
 * server-side (survives refresh); the client ships only the new message each
 * turn. The agent's tool outputs are ComponentSpec[] and render through the
 * same SpecRenderer as before — answers are components, not prose.
 *
 * The offline `/api/chat` + router path still exists as a fallback; this
 * surface uses the real LLM agent.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import {
  useTriggerChatTransport,
  type InferChatUIMessage,
} from "@trigger.dev/sdk/chat/react";
import type { reefChat } from "@/trigger/reef-chat";
import { mintChatAccessToken, startChatSession } from "@/app/actions";
import type { ComponentSpec, DemoDayId } from "@/lib/protocol";
import { SpecRenderer } from "@/components/specs/SpecRenderer";
import {
  createEmptyRoutineProgress,
  restoreRoutineProgress,
  RoutineProgressDock,
  RoutineProgressProvider,
  RoutineProgressRing,
  RoutineTaskMark,
  type RoutineProgressState,
  type RoutineTaskProgress,
} from "@/components/chat/RoutineProgress";
import {
  DEFAULT_DEMO_DAY,
  DEMO_CHAT_PROMPT_EVENT,
  DEMO_DAYS,
  DEMO_DAY_EVENT,
  DEMO_DAY_STORAGE_KEY,
  demoDay,
  isDemoDayId,
  stripDemoDayContext,
  withRoutineContext,
  withDemoDayContext,
  type DemoChatPromptDetail,
} from "@/lib/demo-clock";

gsap.registerPlugin(useGSAP);

type ReefMessage = InferChatUIMessage<typeof reefChat>;

const GENERAL_SUGGESTIONS = [
  "What needs my attention?",
  "How's the auction going?",
  "Any orders to merge?",
  "Weekly report",
  "How's business?",
];
const DRAFT_KEY = "reef-command:merchant-draft";
const ROUTINE_PROGRESS_KEY = "reef-command:routine-progress:v1";
const CHAT_RESPONSE_TIMEOUT_MS = 30_000;

type RoutineTarget = {
  dayId: DemoDayId;
  priorityIndex: number;
};

type ActiveRoutine = RoutineTarget & {
  token: number;
};

type ShipAlertStatus = "request-detected" | "packing-notified" | "protected" | "failed";
type ShipAlert = {
  runId: string;
  status: ShipAlertStatus;
  customerName: string;
  shipmentId: string;
  destination: string;
  protectedCostCents: number;
  requestSummary: string;
};

const PENDING_SHIP_ALERT: ShipAlert = {
  runId: "pending",
  status: "request-detected",
  customerName: "Customer request",
  shipmentId: "matching prepared shipment",
  destination: "checking destination",
  protectedCostCents: 0,
  requestSummary: "Delivery-day change received before carrier handoff.",
};

function safeTraceValue(value: string): string {
  return value.replace(/[\]\n\r]/g, " ").trim();
}

function shipTracePrompt(alert: ShipAlert): string {
  const trace = [
    `status=${alert.status}`,
    `customer=${safeTraceValue(alert.customerName)}`,
    `shipment=${safeTraceValue(alert.shipmentId)}`,
    `request=${safeTraceValue(alert.requestSummary)}`,
    `packing_sms=${alert.status === "request-detected" ? "pending" : "sent"}`,
    `carrier_label=${alert.status === "protected" ? "voided" : "checking"}`,
    `protected_cents=${alert.protectedCostCents}`,
  ].join("; ");
  return `[SYNTHETIC SHIP TRACE: ${trace}]\nExplain this ship-day automation trace.`;
}

function ShipDayAlert({ alert, busy, onReview, onDismiss, onRetry }: {
  alert: ShipAlert;
  busy: boolean;
  onReview: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const protectedUsd = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
  }).format(alert.protectedCostCents / 100);
  const done = alert.status === "protected";
  const failed = alert.status === "failed";
  const matching = alert.runId === "pending";
  const packingNotified = alert.status === "packing-notified" || done;
  return (
    <aside
      role="status"
      aria-live="polite"
      className="anim-rise fixed right-3 bottom-24 left-3 z-30 w-auto overflow-hidden rounded-xl border border-coral/45 bg-panel/96 shadow-[0_24px_70px_rgba(2,10,14,.48)] backdrop-blur-md sm:top-44 sm:right-4 sm:bottom-auto sm:left-auto sm:w-[min(390px,calc(100vw-2rem))]"
    >
      <div className="flex items-start gap-2.5 p-3 sm:gap-3 sm:p-4">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-[14px] sm:h-9 sm:w-9 sm:text-[15px] ${failed ? "border-danger/50 bg-danger/10 text-danger" : done ? "border-ok/45 bg-ok/10 text-ok" : "border-coral/55 bg-coral/10 text-coralhi"}`}>
          {failed ? "!" : done ? "✓" : "↗"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-semibold tracking-[0.07em] text-coral uppercase sm:text-[12px] sm:tracking-[0.08em]">
              Automated by Trigger.dev
            </span>
            <button type="button" onClick={onDismiss} aria-label="Dismiss ship-day alert" className="-mt-1 text-[18px] leading-none text-mute transition-colors hover:text-ink">×</button>
          </div>
          <h2 className="mt-0.5 text-[16px] font-semibold tracking-[-0.01em] text-ink sm:mt-1 sm:text-[17px]">
            {failed ? "Ship-day protection needs review" : done ? "Shipment protected" : "Ship-day change detected"}
          </h2>
          <p className="mt-1 hidden text-[14px] leading-snug text-dim sm:block">
            {failed
              ? "The request was detected, but the local workflow connection is unavailable."
              : matching
              ? "A customer asked to change delivery timing. Matching the prepared shipment now."
              : <>{alert.customerName} changed delivery timing for <span className="font-mono text-ink">{alert.shipmentId}</span>.</>}
          </p>
          <div className="mt-3 hidden space-y-1.5 border-l border-line pl-3 text-[13px] sm:block">
            <p className={packingNotified ? "text-ok" : "text-mute"}>
              {packingNotified ? "✓ Packing team notified · synthetic SMS" : failed ? "○ Packing notification not confirmed" : "○ Notifying packing team · synthetic SMS"}
            </p>
            <p className={done ? "text-ok" : "text-mute"}>
              {done ? "✓ Carrier label voided" : failed ? "○ Carrier label status unchanged" : "○ Carrier label being checked"}
            </p>
          </div>
          {done ? (
            <div className="mt-2 flex items-end justify-between gap-3 border-t border-coral/20 pt-2 sm:mt-3 sm:pt-3">
              <div>
                <p className="text-[11px] font-medium tracking-[0.06em] text-mute uppercase">Charge protected</p>
                <p className="mt-0.5 font-mono text-[18px] tabular-nums text-coralhi sm:text-[20px]">{protectedUsd}</p>
              </div>
              <button
                type="button"
                onClick={onReview}
                disabled={busy}
                className="rounded-md border border-coral bg-coral px-3 py-2 text-[12px] font-semibold text-abyss transition-[background-color,transform] hover:bg-coralhi active:scale-[0.98] disabled:opacity-45"
              >
                Ask Teddy about trace
              </button>
            </div>
          ) : null}
          {failed ? (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-danger/20 pt-3">
              <p className="text-[13px] text-danger">Stopped safely. No action was claimed.</p>
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 rounded-md border border-danger/45 px-3 py-1.5 text-[12px] font-semibold text-danger transition-colors hover:bg-danger/10"
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function CoralPulseSkeleton({ innerRef }: { innerRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={innerRef} className="anim-rise rounded-lg border border-line/70 bg-panel/70 px-3 py-3" aria-label="Teddy is checking live store data">
      <div className="flex items-center gap-1.5">
        <img
          src="/teddy-avatar.jpg"
          alt=""
          width={20}
          height={20}
          className="mr-1 rounded-full ring-1 ring-teal/40"
        />
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="polyp h-2 w-2 rounded-full bg-coral"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
        <span className="ml-1 font-mono text-[13px] tracking-widest text-mute">
          TEDDY&apos;S CHECKING LIVE STORE DATA…
        </span>
      </div>
      <div className="skeleton-bar mt-2.5 h-1 rounded-full" />
    </div>
  );
}

/** Pull the verdict text and the rendered ComponentSpecs out of a message. */
function readAssistant(message: ReefMessage): {
  verdict: string;
  specs: ComponentSpec[];
} {
  let verdict = "";
  const specs: ComponentSpec[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      verdict += part.text;
    } else if (part.type.startsWith("tool-")) {
      const p = part as { state?: string; output?: unknown };
      if (p.state === "output-available" && Array.isArray(p.output)) {
        specs.push(...(p.output as ComponentSpec[]));
      }
    }
  }
  return { verdict: verdict.trim(), specs };
}

function AgentAnswer({ message }: { message: ReefMessage }) {
  const { verdict, specs } = readAssistant(message);
  const [showRest, setShowRest] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);
  const visibleKey = verdict || specs.length ? `${Boolean(verdict)}:${specs.length}` : "";

  useGSAP(() => {
    if (!visibleKey || animatedRef.current || !answerRef.current) return;
    animatedRef.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(
      answerRef.current,
      { autoAlpha: 0, y: 10 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.24,
        ease: "power2.out",
        clearProps: "transform,opacity,visibility",
      },
    );
  }, { dependencies: [visibleKey], scope: answerRef });

  // Feature the first merge candidate; tuck the rest behind a compact
  // affordance so the top of the answer stays on screen.
  const mergeBatches = specs.filter((s) => s.kind === "merge_batch");
  const merges = specs.filter((s) => s.kind === "merge_card");
  const others = specs.filter((s) => s.kind !== "merge_card" && s.kind !== "merge_batch");
  const restMerges = merges.slice(1);

  if (!verdict && specs.length === 0) return <div ref={answerRef} />;

  return (
    <div ref={answerRef} className="space-y-3">
      {verdict ? (
        <div className="flex items-start gap-2.5 border-l-2 border-tealhi/70 pl-2.5">
          <img
            src="/teddy-avatar.jpg"
            alt=""
            width={26}
            height={26}
            className="mt-px shrink-0 rounded-full ring-1 ring-teal/50"
          />
          <p className="text-[15px] leading-relaxed text-ink">
            <span className="mr-2 font-mono text-[13px] tracking-[0.18em] text-teal">
              TEDDY»
            </span>
            {verdict}
          </p>
        </div>
      ) : null}

      {mergeBatches.map((spec, i) => <SpecRenderer key={`mb${i}`} spec={spec} />)}
      {merges.length ? <SpecRenderer spec={merges[0]} /> : null}
      {restMerges.length ? (
        <div className="space-y-3">
          {showRest
            ? restMerges.map((spec, i) => <SpecRenderer key={`m${i}`} spec={spec} />)
            : null}
          <button
            type="button"
            onClick={() => setShowRest((v) => !v)}
            className="rounded-full border border-line px-3 py-1 font-mono text-[13px] text-dim transition-colors hover:border-teal/60 hover:text-tealhi"
          >
            {showRest
              ? "▲ hide extra merge candidates"
              : `+ ${restMerges.length} more merge candidate${restMerges.length > 1 ? "s" : ""}`}
          </button>
        </div>
      ) : null}

      {others.map((spec, i) => (
        <SpecRenderer key={`o${i}`} spec={spec} />
      ))}
    </div>
  );
}

export function MerchantChat() {
  const transport = useTriggerChatTransport<typeof reefChat>({
    task: "reef-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
  });

  const { messages, sendMessage, stop, status, error } = useChat<ReefMessage>({
    transport,
  });
  const [input, setInput] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [demoDayId, setDemoDayId] = useState<DemoDayId>(DEFAULT_DEMO_DAY);
  const [showJump, setShowJump] = useState(false);
  const [shipAlert, setShipAlert] = useState<ShipAlert | null>(null);
  const [shipAlertAttempt, setShipAlertAttempt] = useState(0);
  const [traceFollowupPending, setTraceFollowupPending] = useState(false);
  const [routineProgress, setRoutineProgress] = useState<RoutineProgressState>(createEmptyRoutineProgress);
  const [routineProgressReady, setRoutineProgressReady] = useState(false);
  const [requestFailure, setRequestFailure] = useState<string | null>(null);
  const demoDayRef = useRef<DemoDayId>(DEFAULT_DEMO_DAY);
  const shipAlertStartedRef = useRef(false);
  const activeRoutineRef = useRef<ActiveRoutine | null>(null);
  const routineHadVisualRef = useRef(false);
  const routineTokenRef = useRef(0);
  const streamRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const followAnswerRef = useRef(true);
  const scrollTweenRef = useRef<gsap.core.Tween | null>(null);

  const waiting = status === "submitted";
  const streaming = status === "streaming";
  const newest = messages[messages.length - 1];
  const newestAnswer = newest?.role === "assistant" ? readAssistant(newest) : null;
  const newestVisualKey = newestAnswer?.specs.map((spec) => spec.kind).join("|") ?? "";
  const showWorking = waiting || (
    streaming && (!newestAnswer || (!newestAnswer.verdict && newestAnswer.specs.length === 0))
  );

  const updateRoutine = useCallback((
    target: RoutineTarget,
    next: RoutineTaskProgress | ((current: RoutineTaskProgress) => RoutineTaskProgress),
  ) => {
    setRoutineProgress((current) => {
      const dayTasks = current[target.dayId] ?? [];
      const existing = dayTasks[target.priorityIndex] ?? { status: "idle", progress: 0 };
      const updated = typeof next === "function" ? next(existing) : next;
      const tasks = dayTasks.map((task, index) => index === target.priorityIndex ? updated : task);
      return { ...current, [target.dayId]: tasks };
    });
  }, []);

  const beginRoutine = useCallback((target: RoutineTarget): ActiveRoutine => {
    const active = { ...target, token: ++routineTokenRef.current };
    activeRoutineRef.current = active;
    routineHadVisualRef.current = false;
    updateRoutine(target, { status: "running", progress: 8 });
    return active;
  }, [updateRoutine]);

  const finishRoutine = useCallback((active: ActiveRoutine, status: "complete" | "failed") => {
    if (activeRoutineRef.current?.token !== active.token) return;
    updateRoutine(active, {
      status,
      progress: status === "complete" ? 100 : 0,
    });
    routineHadVisualRef.current = false;
    activeRoutineRef.current = null;
  }, [updateRoutine]);

  const scrollToLatest = useCallback((force = false) => {
    if (!force && !followAnswerRef.current) return;
    const scroller = streamRef.current;
    const target = lastRef.current;
    if (!scroller || !target) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = Math.max(0, scroller.scrollTop + targetRect.top - scrollerRect.top - 12);

    scrollTweenRef.current?.kill();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scroller.scrollTop = top;
      return;
    }
    scrollTweenRef.current = gsap.to(scroller, {
      scrollTop: top,
      duration: 0.32,
      ease: "power2.out",
      overwrite: "auto",
      onComplete: () => { scrollTweenRef.current = null; },
    });
  }, []);

  const pauseAnswerFollow = useCallback(() => {
    if (!messages.length && !showWorking) return;
    followAnswerRef.current = false;
    scrollTweenRef.current?.kill();
    setShowJump(true);
  }, [messages.length, showWorking]);

  // Land the viewport on the START of the newest turn — the strong visual
  // answers (merge cards, the tall report) open above the fold, not below it.
  // Trigger chat streams tool output into an existing assistant message, so
  // message count alone is not a sufficient signal: scroll again when the
  // renderable component kinds arrive.
  useEffect(() => {
    if (!followAnswerRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollToLatest());
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, newestVisualKey, scrollToLatest, showWorking]);

  useEffect(() => () => {
    scrollTweenRef.current?.kill();
  }, []);

  useEffect(() => {
    const draft = window.sessionStorage.getItem(DRAFT_KEY);
    if (draft) setInput(draft);
    const storedDay = window.sessionStorage.getItem(DEMO_DAY_STORAGE_KEY);
    if (isDemoDayId(storedDay)) {
      demoDayRef.current = storedDay;
      setDemoDayId(storedDay);
    }
    setRoutineProgress(restoreRoutineProgress(window.sessionStorage.getItem(ROUTINE_PROGRESS_KEY)));
    setRoutineProgressReady(true);
    setDraftReady(true);
    if (window.matchMedia("(pointer: fine)").matches) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    if (input) window.sessionStorage.setItem(DRAFT_KEY, input);
    else window.sessionStorage.removeItem(DRAFT_KEY);
  }, [draftReady, input]);

  useEffect(() => {
    if (!routineProgressReady) return;
    window.sessionStorage.setItem(ROUTINE_PROGRESS_KEY, JSON.stringify(routineProgress));
  }, [routineProgress, routineProgressReady]);

  useEffect(() => {
    const active = activeRoutineRef.current;
    if (!active) return;
    if (newestAnswer?.specs.length) routineHadVisualRef.current = true;
    if (waiting) {
      updateRoutine(active, (task) => ({ ...task, status: "running", progress: Math.max(task.progress, 24) }));
      return;
    }
    if (streaming) {
      const progress = newestAnswer?.specs.length ? 88 : newestAnswer?.verdict ? 72 : 52;
      updateRoutine(active, (task) => ({ ...task, status: "running", progress: Math.max(task.progress, progress) }));
    }
  }, [newestAnswer?.specs.length, newestAnswer?.verdict, streaming, updateRoutine, waiting]);

  useEffect(() => {
    const active = activeRoutineRef.current;
    if (!active || waiting || streaming || status !== "ready") return;
    // Every routine maps to a structured tool. A prose-only turn can be an
    // honest tool/network failure, but it is not completed operational work.
    finishRoutine(active, routineHadVisualRef.current ? "complete" : "failed");
  }, [finishRoutine, status, streaming, waiting]);

  useEffect(() => {
    const active = activeRoutineRef.current;
    if (!error || !active) return;
    finishRoutine(active, "failed");
  }, [error, finishRoutine]);

  useEffect(() => {
    if (!waiting && !streaming) return;
    const timeout = window.setTimeout(() => {
      const active = activeRoutineRef.current;
      if (active) finishRoutine(active, "failed");
      setRequestFailure(
        "Teddy did not receive an agent response within 30 seconds. Confirm the local Trigger.dev worker is running, then retry.",
      );
      void stop();
    }, CHAT_RESPONSE_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [finishRoutine, stop, streaming, waiting]);

  const submit = useCallback((text: string, dayOverride?: DemoDayId, routine?: RoutineTarget) => {
    let message = text.trim();
    if (!message || waiting || streaming) return;
    if (traceFollowupPending) {
      if (/^(?:yes|yes please|yep|yeah|sure|okay|ok)\b/i.test(message)) {
        message = "Yes. Show me all other things that need my attention.";
      }
      setTraceFollowupPending(false);
    }
    followAnswerRef.current = true;
    setShowJump(false);
    setRequestFailure(null);
    setInput("");
    if (routine) beginRoutine(routine);
    const routedMessage = routine ? withRoutineContext(routine.priorityIndex, message) : message;
    const request = sendMessage({ text: withDemoDayContext(dayOverride ?? demoDayRef.current, routedMessage) });
    void request.catch(() => {
      const active = activeRoutineRef.current;
      if (active) finishRoutine(active, "failed");
    });
  }, [beginRoutine, finishRoutine, sendMessage, streaming, traceFollowupPending, waiting]);

  useEffect(() => {
    if (demoDayId !== "tuesday") {
      shipAlertStartedRef.current = false;
      setShipAlert(null);
      return;
    }
    if (shipAlertStartedRef.current) return;
    shipAlertStartedRef.current = true;
    // The alert is the inbound event, so show it before waiting on the durable
    // workflow. This keeps the autonomous signal visible even when a local
    // dependency is unavailable; the card then fails closed instead of
    // disappearing.
    setShipAlert(PENDING_SHIP_ALERT);
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let pollCount = 0;

    const start = async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (cancelled) return;
      try {
        const response = await fetch("/api/demo/ship-day-exception", { method: "POST" });
        const body = await response.json() as {
          ok: boolean;
          runId?: string;
          reused?: boolean;
          status?: ShipAlertStatus;
          incident?: Omit<ShipAlert, "runId" | "status">;
        };
        if (!response.ok || !body.ok || !body.incident) throw new Error("start failed");
        if (body.reused && body.status === "protected") {
          if (!cancelled) {
            setShipAlert({ ...body.incident, runId: "reused", status: "protected" });
          }
          return;
        }
        if (!body.runId) throw new Error("run id missing");
        const base: ShipAlert = { ...body.incident, runId: body.runId, status: "request-detected" };
        if (!cancelled) setShipAlert(base);

        const poll = async () => {
          if (cancelled) return;
          pollCount += 1;
          const statusResponse = await fetch(`/api/demo/ship-day-exception?runId=${encodeURIComponent(body.runId!)}`);
          const statusBody = await statusResponse.json() as { ok: boolean; metadata?: Record<string, unknown> };
          if (!statusResponse.ok || !statusBody.ok) throw new Error("poll failed");
          const status = statusBody.metadata?.status;
          if (typeof status === "string" && ["request-detected", "packing-notified", "protected", "failed"].includes(status)) {
            setShipAlert((current) => current ? {
              ...current,
              status: status as ShipAlertStatus,
              customerName: String(statusBody.metadata?.customerName ?? current.customerName),
              shipmentId: String(statusBody.metadata?.shipmentId ?? current.shipmentId),
              destination: String(statusBody.metadata?.destination ?? current.destination),
              protectedCostCents: Number(statusBody.metadata?.protectedCostCents ?? current.protectedCostCents),
              requestSummary: String(statusBody.metadata?.requestSummary ?? current.requestSummary),
            } : current);
            if (status === "protected" || status === "failed") return;
          }
          if (pollCount >= 60) {
            setShipAlert((current) => current ? { ...current, status: "failed" } : current);
            return;
          }
          pollTimer = setTimeout(() => { void poll().catch(() => setShipAlert((current) => current ? { ...current, status: "failed" } : current)); }, 650);
        };
        await poll();
      } catch {
        if (!cancelled) {
          shipAlertStartedRef.current = false;
          setShipAlert((current) => current ? { ...current, status: "failed" } : current);
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [demoDayId, shipAlertAttempt]);

  useEffect(() => {
    const onDay = (event: Event) => {
      const next = (event as CustomEvent<DemoDayId>).detail;
      if (!DEMO_DAYS.some((day) => day.id === next)) return;
      // Keep the header and chat on one accepted day. A rapid click while the
      // current turn is in flight must not update Today without sending the
      // matching hidden context and dayBrief request.
      if (waiting || streaming) {
        event.preventDefault();
        return;
      }
      demoDayRef.current = next;
      setDemoDayId(next);
      window.sessionStorage.setItem(DEMO_DAY_STORAGE_KEY, next);
      const day = demoDay(next);
      submit(
        `Show me ${day.weekday}'s three jobs and today's note.`,
        next,
      );
    };
    const onPrompt = (event: Event) => {
      const detail = (event as CustomEvent<string | DemoChatPromptDetail>).detail;
      if (typeof detail === "string") {
        submit(detail);
        return;
      }
      if (
        detail &&
        typeof detail.prompt === "string" &&
        isDemoDayId(detail.dayId) &&
        Number.isInteger(detail.priorityIndex)
      ) {
        submit(detail.prompt, detail.dayId, {
          dayId: detail.dayId,
          priorityIndex: detail.priorityIndex,
        });
      }
    };
    window.addEventListener(DEMO_DAY_EVENT, onDay);
    window.addEventListener(DEMO_CHAT_PROMPT_EVENT, onPrompt);
    return () => {
      window.removeEventListener(DEMO_DAY_EVENT, onDay);
      window.removeEventListener(DEMO_CHAT_PROMPT_EVENT, onPrompt);
    };
  }, [streaming, submit, waiting]);

  const currentDay = demoDay(demoDayId);
  const currentProgress = routineProgress[demoDayId];
  const hasRoutineProgress = currentProgress.some((task) => task.status !== "idle" || task.progress > 0);
  const suggestions = [
    ...currentDay.priorities.flatMap((priority, index) => priority.prompt ? [{
      prompt: priority.prompt,
      routine: { dayId: demoDayId, priorityIndex: index } satisfies RoutineTarget,
    }] : []),
    ...GENERAL_SUGGESTIONS.map((prompt) => ({ prompt, routine: undefined })),
  ].filter((suggestion, index, all) => all.findIndex((item) => item.prompt === suggestion.prompt) === index).slice(0, 3);

  return (
    <RoutineProgressProvider value={routineProgress} busy={waiting || streaming}>
    <div className="flex min-h-0 flex-1 flex-col">
      {shipAlert ? (
        <ShipDayAlert
          alert={shipAlert}
          busy={waiting || streaming}
          onReview={() => {
            submit(shipTracePrompt(shipAlert));
            setTraceFollowupPending(true);
            setShipAlert(null);
          }}
          onDismiss={() => setShipAlert(null)}
          onRetry={() => {
            shipAlertStartedRef.current = false;
            setShipAlertAttempt((attempt) => attempt + 1);
          }}
        />
      ) : null}
      {/* stream */}
      <div
        ref={streamRef}
        className="reef-room min-h-0 flex-1 overflow-y-auto"
        onWheel={pauseAnswerFollow}
        onTouchMove={pauseAnswerFollow}
      >
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
          {messages.length > 0 && hasRoutineProgress ? (
            <RoutineProgressDock
              weekday={currentDay.weekday}
              priorities={currentDay.priorities}
              tasks={currentProgress}
              busy={waiting || streaming}
              onStart={(index) => {
                const priority = currentDay.priorities[index];
                submit(
                  priority.prompt ?? priority.label,
                  demoDayId,
                  { dayId: demoDayId, priorityIndex: index },
                );
              }}
            />
          ) : null}
          {messages.length === 0 && status === "ready" ? (
            <section className="max-w-3xl py-5 md:py-10">
              <div className="text-left">
                <div className="flex items-center gap-3">
                  <Image
                    src="/teddy-avatar.jpg"
                    alt="Teddy, the reef co-pilot"
                    width={42}
                    height={42}
                    className="rounded-lg ring-1 ring-coral/55"
                  />
                  <p className="text-[13px] font-semibold tracking-[0.08em] text-coral uppercase">
                    {currentDay.weekday} / {currentDay.time}
                  </p>
                </div>
                <h1 className="mt-5 max-w-[12ch] text-[40px] leading-[1.02] font-semibold tracking-[-0.045em] text-ink sm:text-[52px]">
                  {currentDay.label}.
                </h1>
                <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-dim">
                  TIA Coral runs on a weekly auction-to-shipping rhythm. Start one of today&apos;s three jobs.
                </p>

                <div className="mt-8 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[14px] font-semibold tracking-[0.06em] text-ink uppercase">Today&apos;s focus</h2>
                      <p className="mt-1 text-[13px] text-mute">Live routine progress</p>
                    </div>
                    <RoutineProgressRing tasks={currentProgress} />
                  </div>
                  <ul className="mt-2 border-y border-line/80">
                  {currentDay.priorities.map((priority, index) => (
                    <li key={priority.label} className="border-b border-line/65 last:border-0">
                      <button
                        type="button"
                        onClick={() => submit(
                          priority.prompt ?? priority.label,
                          demoDayId,
                          { dayId: demoDayId, priorityIndex: index },
                        )}
                        disabled={waiting || streaming}
                        aria-label={`Start routine: ${priority.label}`}
                        className="group flex min-h-14 w-full items-center gap-3 px-1 py-3 text-left transition-[color,background-color,transform] hover:bg-coral/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/35 active:translate-x-0.5 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <RoutineTaskMark task={currentProgress[index]} index={index} />
                        <span className="min-w-0 flex-1 text-[16px] leading-snug text-ink">{priority.label}</span>
                        <span className={`text-[12px] font-semibold ${currentProgress[index].status === "complete" ? "text-ok" : currentProgress[index].status === "running" ? "text-coralhi" : currentProgress[index].status === "failed" ? "text-danger" : "text-mute"}`}>
                          {currentProgress[index].status === "complete" ? "DONE" : currentProgress[index].status === "running" ? "RUNNING" : currentProgress[index].status === "failed" ? "RETRY" : "START"}
                        </span>
                        <span aria-hidden className="translate-x-0 text-[18px] text-mute transition-[color,transform] group-hover:translate-x-1 group-hover:text-coral">→</span>
                      </button>
                    </li>
                  ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            return m.role === "user" ? (
              <div
                key={m.id}
                ref={isLast ? lastRef : undefined}
                className="flex justify-end"
              >
                <p className="anim-rise max-w-[75%] rounded-md rounded-br-sm border border-line bg-raise px-3.5 py-2 text-[15px] text-ink">
                  {m.parts
                    .filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p) => p.text)
                    .map(stripDemoDayContext)
                    .join("")}
                </p>
              </div>
            ) : (
              <div key={m.id} ref={isLast ? lastRef : undefined}>
                <AgentAnswer message={m} />
              </div>
            );
          })}

          {showWorking ? <CoralPulseSkeleton innerRef={lastRef} /> : null}

          {error || requestFailure ? (
            <div className="anim-rise">
              <SpecRenderer
                spec={{
                  kind: "verdict_card",
                  verdict: requestFailure ?? "The agent could not complete this request. Please retry.",
                  confidence: "low",
                  evidence: [{
                    label: "next step",
                    detail: requestFailure
                      ? "Keep the Trigger.dev local worker running, then start the task again."
                      : "Retry the task. If it fails again, check the local app and agent-worker terminals.",
                  }],
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* composer */}
      <div className="border-t border-line/80 bg-abyss/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 pt-2.5 pb-4 sm:px-6">
          {showJump ? (
            <div className="mb-2 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  followAnswerRef.current = true;
                  setShowJump(false);
                  scrollToLatest(true);
                }}
                className="rounded-full border border-coral/45 bg-abyss/90 px-3 py-1 font-mono text-[13px] text-coralhi shadow-[0_8px_26px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                ↓ JUMP TO TEDDY
              </button>
            </div>
          ) : null}
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.prompt}
                type="button"
                onClick={() => submit(suggestion.prompt, demoDayId, suggestion.routine)}
                disabled={waiting || streaming}
                className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-[color,background-color,border-color,transform] active:scale-[0.98] disabled:opacity-50 ${
                  index === 0
                    ? "border-coral/45 bg-coral/[0.06] text-coralhi hover:border-coral/75 hover:bg-coral/10"
                    : "border-line text-dim hover:border-teal/60 hover:text-tealhi"
                }`}
              >
                {suggestion.prompt}
              </button>
            ))}
            {waiting || streaming ? (
              // Visible during BOTH in-flight phases: if a run hangs before it
              // streams (dead worker, sandboxed network), STOP is the way out —
              // without it the composer would wait forever with no exit.
              <button
                type="button"
                onClick={() => {
                  const active = activeRoutineRef.current;
                  if (active) finishRoutine(active, "failed");
                  void stop();
                }}
                className="rounded-full border border-coral/70 px-3 py-1 font-mono text-[13px] text-coralhi transition-colors hover:bg-coral/15"
              >
                ◼ STOP
              </button>
            ) : null}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex gap-2"
          >
            {/* Never disabled: typing must survive a hung or slow run. Only
                SEND gates on in-flight state. */}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Teddy about attention, orders, auction, or the report…"
              aria-label="Message"
              className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-4 py-3 text-[15px] text-ink placeholder:text-mute transition-[border-color,box-shadow] focus:border-coral/70 focus:shadow-[0_0_0_3px_rgba(255,133,89,0.08)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={waiting || streaming || !input.trim()}
              className="rounded-lg border border-coral bg-coral px-5 text-[13px] font-semibold text-abyss transition-[background-color,transform] hover:bg-coralhi active:scale-[0.98] disabled:border-coral/35 disabled:bg-coral/10 disabled:text-coralhi disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
    </RoutineProgressProvider>
  );
}
