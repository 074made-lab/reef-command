"use client";

/** The chat cockpit: user bubbles right, agent answers as full-width
 *  component stacks with a one-line verdict above. History lives in client
 *  state only. The same shell serves /merchant (live) and /shop (disabled). */

import { useEffect, useRef, useState } from "react";
import type { ChatResponse } from "@/lib/protocol";
import { SpecRenderer } from "@/components/specs/SpecRenderer";

type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "agent"; response: ChatResponse };

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
        <span className="ml-1 font-mono text-[10px] tracking-widest text-mute">
          READING THE REEF…
        </span>
      </div>
      <div className="skeleton-bar h-16 rounded-md border border-line/50" />
      <div className="skeleton-bar h-28 rounded-md border border-line/50" />
    </div>
  );
}

function AgentAnswer({ response }: { response: ChatResponse }) {
  return (
    <div className="anim-rise space-y-3">
      {response.verdict ? (
        <p className="flex items-baseline gap-2 border-l-2 border-tealhi/70 pl-2.5 text-[14px] leading-snug text-ink">
          <span className="shrink-0 font-mono text-[10px] tracking-[0.2em] text-teal">
            REEF»
          </span>
          {response.verdict}
        </p>
      ) : null}
      {response.components.map((spec, i) => (
        <SpecRenderer key={i} spec={spec} />
      ))}
    </div>
  );
}

export function ChatShell({
  disabled = false,
  placeholder = "Ask the reef anything…",
  initialMessages = [],
}: {
  disabled?: boolean;
  placeholder?: string;
  initialMessages?: ChatResponse[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.map((r, i) => ({ id: i, role: "agent", response: r })),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(initialMessages.length);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || disabled) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId.current++, role: "user", text: message }]);
    setBusy(true);
    let response: ChatResponse;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error(`chat API ${res.status}`);
      response = (await res.json()) as ChatResponse;
    } catch (err) {
      response = {
        verdict: "Lost contact with the cockpit — try again in a moment.",
        components: [
          {
            kind: "verdict_card",
            verdict: "The chat endpoint did not answer.",
            confidence: "low",
            evidence: [
              { label: "error", detail: err instanceof Error ? err.message : String(err) },
            ],
          },
        ],
      };
    }
    setMessages((m) => [...m, { id: nextId.current++, role: "agent", response }]);
    setBusy(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* stream */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-5">
          {messages.length === 0 && !busy ? (
            <div className="pt-16 text-center">
              <p className="font-mono text-[11px] tracking-[0.3em] text-mute uppercase">
                channel open
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
                  {m.text}
                </p>
              </div>
            ) : (
              <AgentAnswer key={m.id} response={m.response} />
            ),
          )}
          {busy ? <CoralPulseSkeleton /> : null}
          <div ref={endRef} />
        </div>
      </div>

      {/* composer */}
      <div className="border-t border-line/80 bg-abyss/90 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 pt-2.5 pb-4">
          {!disabled ? (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={busy}
                  className="rounded-full border border-line px-3 py-1 font-mono text-[11px] text-dim transition-colors hover:border-teal/60 hover:text-tealhi disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={disabled || busy}
              placeholder={placeholder}
              aria-label="Message"
              className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3.5 py-2.5 font-mono text-[13px] text-ink placeholder:text-mute focus:border-teal focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || busy || !input.trim()}
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
