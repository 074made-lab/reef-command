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
  DEFAULT_DEMO_DAY,
  DEMO_CHAT_PROMPT_EVENT,
  DEMO_DAYS,
  DEMO_DAY_EVENT,
  demoDay,
  stripDemoDayContext,
  withDemoDayContext,
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

  // Feature the first merge candidate (the signature shot); tuck the rest
  // behind a compact affordance so the top of the answer stays on screen (m2).
  const merges = specs.filter((s) => s.kind === "merge_card");
  const others = specs.filter((s) => s.kind !== "merge_card");
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
  const demoDayRef = useRef<DemoDayId>(DEFAULT_DEMO_DAY);
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

  const submit = useCallback((text: string, dayOverride?: DemoDayId) => {
    const message = text.trim();
    if (!message || waiting || streaming) return;
    followAnswerRef.current = true;
    setShowJump(false);
    setInput("");
    void sendMessage({ text: withDemoDayContext(dayOverride ?? demoDayRef.current, message) });
  }, [sendMessage, streaming, waiting]);

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
      const day = demoDay(next);
      submit(
        `Show me ${day.weekday}'s command brief. What are today's priorities, and what should you remind me not to miss?`,
        next,
      );
    };
    const onPrompt = (event: Event) => {
      const prompt = (event as CustomEvent<string>).detail;
      if (typeof prompt === "string") submit(prompt);
    };
    window.addEventListener(DEMO_DAY_EVENT, onDay);
    window.addEventListener(DEMO_CHAT_PROMPT_EVENT, onPrompt);
    return () => {
      window.removeEventListener(DEMO_DAY_EVENT, onDay);
      window.removeEventListener(DEMO_CHAT_PROMPT_EVENT, onPrompt);
    };
  }, [streaming, submit, waiting]);

  const currentDay = demoDay(demoDayId);
  const suggestions = [
    ...currentDay.priorities.flatMap((priority) => priority.prompt ? [priority.prompt] : []),
    ...GENERAL_SUGGESTIONS,
  ].filter((suggestion, index, all) => all.indexOf(suggestion) === index).slice(0, 3);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* stream */}
      <div
        ref={streamRef}
        className="reef-room min-h-0 flex-1 overflow-y-auto"
        onWheel={pauseAnswerFollow}
        onTouchMove={pauseAnswerFollow}
      >
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-5">
          {messages.length === 0 && status === "ready" ? (
            <div className="pt-4 text-center">
              {/* Teddy — the real reef dog behind the store. The first frame a
                  judge sees: a face, not a terminal. */}
              <img
                src="/teddy.jpg"
                alt="Teddy the reef dog, wearing his HAPPY REEFING headband in front of the coral tanks"
                width={96}
                height={96}
                className="coral-halo mx-auto rounded-full ring-2 ring-coral/70"
              />
              <p className="mt-3 font-mono text-[13px] tracking-[0.22em] text-teal uppercase">
                {currentDay.weekday} · {currentDay.label}
              </p>
              <p className="mt-1.5 text-[15px] text-dim">
                Teddy&apos;s ready. Pick a focus or ask what needs attention.
              </p>
              <div className="mx-auto mt-4 max-w-2xl rounded-lg border border-coral/30 bg-panel/75 p-3.5 text-left shadow-[0_18px_55px_rgba(0,0,0,0.22)] backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3 font-mono text-[13px] tracking-[0.14em] uppercase">
                  <span className="text-coral">Today&apos;s focus</span>
                  <span className="text-mute">{currentDay.short} · {currentDay.time}</span>
                </div>
                <ul className="mt-2.5 grid gap-2 sm:grid-cols-3">
                  {currentDay.priorities.map((priority, index) => (
                    <li key={priority.label} className="flex items-start gap-2 rounded-md bg-abyss/45 px-2.5 py-2">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${index === 0 ? "bg-coral shadow-[0_0_10px_rgba(255,133,89,0.38)]" : "bg-tealhi/70"}`} />
                      <span className="text-[13px] leading-snug text-ink">{priority.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
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

          {error ? (
            <div className="anim-rise">
              <SpecRenderer
                spec={{
                  kind: "verdict_card",
                  verdict: "The agent hit an error — showing it, not a guess.",
                  confidence: "low",
                  evidence: [{ label: "error", detail: error.message }],
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* composer */}
      <div className="border-t border-line/80 bg-[linear-gradient(180deg,rgba(4,9,14,.88),rgba(4,9,14,.98))] backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 pt-2.5 pb-4">
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
            {suggestions.map((s, index) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                disabled={waiting || streaming}
                className={`rounded-full border px-3 py-1 font-mono text-[13px] transition-[color,background-color,border-color,transform] active:scale-[0.98] disabled:opacity-50 ${
                  index === 0
                    ? "border-coral/45 bg-coral/[0.06] text-coralhi hover:border-coral/75 hover:bg-coral/10"
                    : "border-line text-dim hover:border-teal/60 hover:text-tealhi"
                }`}
              >
                {s}
              </button>
            ))}
            {waiting || streaming ? (
              // Visible during BOTH in-flight phases: if a run hangs before it
              // streams (dead worker, sandboxed network), STOP is the way out —
              // without it the composer would wait forever with no exit.
              <button
                type="button"
                onClick={() => void stop()}
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
            {/* Never disabled: typing must survive a hung or slow run — only
                SEND gates on in-flight state. A locked composer reads as a
                broken product on camera. */}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Teddy about attention, orders, auction, or the report…"
              aria-label="Message"
              className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3.5 py-2.5 font-mono text-[14px] text-ink placeholder:text-mute transition-[border-color,box-shadow] focus:border-coral/70 focus:shadow-[0_0_0_3px_rgba(255,133,89,0.08)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={waiting || streaming || !input.trim()}
              className="rounded-md border border-coral bg-coral px-4 font-mono text-[13px] font-bold tracking-widest text-abyss shadow-[0_0_22px_rgba(255,133,89,0.14)] transition-colors hover:bg-coralhi disabled:border-coral/35 disabled:bg-coral/10 disabled:text-coralhi disabled:shadow-none disabled:opacity-50"
            >
              SEND ▸
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
