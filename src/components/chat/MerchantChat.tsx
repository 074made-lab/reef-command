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

type ReefMessage = InferChatUIMessage<typeof reefChat>;

const GENERAL_SUGGESTIONS = [
  "What needs my attention?",
  "How's the auction going?",
  "Any orders to merge?",
  "Weekly report",
  "How's business?",
];

function CoralPulseSkeleton() {
  return (
    <div className="anim-rise space-y-2.5" aria-label="thinking">
      <div className="flex items-center gap-1.5 pl-0.5">
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
        <span className="ml-1 font-mono text-[12px] tracking-widest text-mute">
          TEDDY&apos;S READING THE REEF…
        </span>
      </div>
      <div className="skeleton-bar h-16 rounded-md border border-line/50" />
      <div className="skeleton-bar h-28 rounded-md border border-line/50" />
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

function AgentAnswer({
  message,
  innerRef,
}: {
  message: ReefMessage;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const { verdict, specs } = readAssistant(message);
  const [showRest, setShowRest] = useState(false);

  // Feature the first merge candidate (the signature shot); tuck the rest
  // behind a compact affordance so the top of the answer stays on screen (m2).
  const merges = specs.filter((s) => s.kind === "merge_card");
  const others = specs.filter((s) => s.kind !== "merge_card");
  const restMerges = merges.slice(1);

  if (!verdict && specs.length === 0) return <div ref={innerRef} />;

  return (
    <div ref={innerRef} className="anim-rise space-y-3">
      {verdict ? (
        <div className="flex items-start gap-2.5 border-l-2 border-tealhi/70 pl-2.5">
          <img
            src="/teddy-avatar.jpg"
            alt=""
            width={26}
            height={26}
            className="mt-px shrink-0 rounded-full ring-1 ring-teal/50"
          />
          <p className="text-[14px] leading-snug text-ink">
            <span className="mr-2 font-mono text-[12px] tracking-[0.2em] text-teal">
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
            className="rounded-full border border-line px-3 py-1 font-mono text-[12px] text-dim transition-colors hover:border-teal/60 hover:text-tealhi"
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
  const [demoDayId, setDemoDayId] = useState<DemoDayId>(DEFAULT_DEMO_DAY);
  const demoDayRef = useRef<DemoDayId>(DEFAULT_DEMO_DAY);
  const lastRef = useRef<HTMLDivElement>(null);

  const waiting = status === "submitted";
  const streaming = status === "streaming";

  // Land the viewport on the START of the newest turn — the strong visual
  // answers (merge cards, the tall report) open above the fold, not below it.
  useEffect(() => {
    lastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [messages.length]);

  const submit = useCallback((text: string, dayOverride?: DemoDayId) => {
    const message = text.trim();
    if (!message || waiting || streaming) return;
    setInput("");
    void sendMessage({ text: withDemoDayContext(dayOverride ?? demoDayRef.current, message) });
  }, [sendMessage, streaming, waiting]);

  useEffect(() => {
    const onDay = (event: Event) => {
      const next = (event as CustomEvent<DemoDayId>).detail;
      if (!DEMO_DAYS.some((day) => day.id === next)) return;
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
  }, [submit]);

  const currentDay = demoDay(demoDayId);
  const suggestions = [
    ...currentDay.priorities.flatMap((priority) => priority.prompt ? [priority.prompt] : []),
    ...GENERAL_SUGGESTIONS,
  ].filter((suggestion, index, all) => all.indexOf(suggestion) === index).slice(0, 5);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* stream */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-5">
          {messages.length === 0 && status === "ready" ? (
            <div className="pt-10 text-center">
              {/* Teddy — the real reef dog behind the store. The first frame a
                  judge sees: a face, not a terminal. */}
              <img
                src="/teddy.jpg"
                alt="Teddy the reef dog, wearing his HAPPY REEFING headband in front of the coral tanks"
                width={112}
                height={112}
                className="mx-auto rounded-full ring-2 ring-coral/60 shadow-[0_0_46px_rgba(232,86,43,0.28)]"
              />
              <p className="mt-4 font-mono text-[12px] tracking-[0.3em] text-mute uppercase">
                channel open · today is {currentDay.weekday} · {currentDay.label}
              </p>
              <p className="mt-2 text-sm text-dim">
                Teddy&apos;s watching the reef. Choose a day above — he&apos;ll brief the
                priorities and open the right component.
              </p>
              <p className="mt-1.5 font-mono text-[11px] tracking-[0.24em] text-coralhi/85 uppercase">
                happy reefing
              </p>
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
                <p className="anim-rise max-w-[75%] rounded-md rounded-br-sm border border-line bg-raise px-3.5 py-2 text-[14px] text-ink">
                  {m.parts
                    .filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p) => p.text)
                    .map(stripDemoDayContext)
                    .join("")}
                </p>
              </div>
            ) : (
              <AgentAnswer key={m.id} message={m} innerRef={isLast ? lastRef : undefined} />
            );
          })}

          {waiting ? <CoralPulseSkeleton /> : null}

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
      <div className="border-t border-line/80 bg-abyss/90 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 pt-2.5 pb-4">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                disabled={waiting || streaming}
                className="rounded-full border border-line px-3 py-1 font-mono text-[12px] text-dim transition-colors hover:border-teal/60 hover:text-tealhi disabled:opacity-50"
              >
                {s}
              </button>
            ))}
            {streaming ? (
              <button
                type="button"
                onClick={() => void stop()}
                className="rounded-full border border-coral/70 px-3 py-1 font-mono text-[12px] text-coralhi transition-colors hover:bg-coral/15"
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
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={waiting || streaming}
              placeholder="Ask Teddy — attention, revenue, auction, merges, report…"
              aria-label="Message"
              className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3.5 py-2.5 font-mono text-[13px] text-ink placeholder:text-mute focus:border-teal focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={waiting || streaming || !input.trim()}
              className="rounded-md border border-coral/70 bg-coral/15 px-4 font-mono text-[12px] font-semibold tracking-widest text-coralhi transition-colors hover:bg-coral/25 disabled:opacity-40"
            >
              SEND ▸
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
