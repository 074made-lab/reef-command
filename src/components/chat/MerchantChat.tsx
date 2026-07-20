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
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  useTriggerChatTransport,
  type InferChatUIMessage,
} from "@trigger.dev/sdk/chat/react";
import type { reefChat } from "@/trigger/reef-chat";
import { mintChatAccessToken, startChatSession } from "@/app/actions";
import type { ComponentSpec } from "@/lib/protocol";
import { SpecRenderer } from "@/components/specs/SpecRenderer";

type ReefMessage = InferChatUIMessage<typeof reefChat>;

const SUGGESTIONS = [
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
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="polyp h-2 w-2 rounded-full bg-coral"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
        <span className="ml-1 font-mono text-[12px] tracking-widest text-mute">
          READING THE REEF…
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

function AgentAnswer({ message }: { message: ReefMessage }) {
  const { verdict, specs } = readAssistant(message);
  if (!verdict && specs.length === 0) return null;
  return (
    <div className="anim-rise space-y-3">
      {verdict ? (
        <p className="flex items-baseline gap-2 border-l-2 border-tealhi/70 pl-2.5 text-[14px] leading-snug text-ink">
          <span className="shrink-0 font-mono text-[12px] tracking-[0.2em] text-teal">
            REEF»
          </span>
          {verdict}
        </p>
      ) : null}
      {specs.map((spec, i) => (
        <SpecRenderer key={i} spec={spec} />
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

  const waiting = status === "submitted";
  const streaming = status === "streaming";

  function submit(text: string) {
    const message = text.trim();
    if (!message || waiting || streaming) return;
    setInput("");
    void sendMessage({ text: message });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* stream */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-5">
          {messages.length === 0 && status === "ready" ? (
            <div className="pt-16 text-center">
              <p className="font-mono text-[12px] tracking-[0.3em] text-mute uppercase">
                channel open · Teddy is watching the reef
              </p>
              <p className="mt-2 text-sm text-dim">
                Ask about the week — answers come back as live components, not
                prose.
              </p>
            </div>
          ) : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="anim-rise max-w-[75%] rounded-md rounded-br-sm border border-line bg-raise px-3.5 py-2 text-[14px] text-ink">
                  {m.parts
                    .filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p) => p.text)
                    .join("")}
                </p>
              </div>
            ) : (
              <AgentAnswer key={m.id} message={m} />
            ),
          )}

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
            {SUGGESTIONS.map((s) => (
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
              placeholder="Ask the reef — attention, revenue, auction, merges, report…"
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
