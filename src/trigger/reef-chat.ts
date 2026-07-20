/**
 * Reef Command chat agent — the LLM brain as a durable Trigger.dev task.
 *
 * A `chat.agent()` running Claude (Sonnet) via the Vercel AI SDK, driven from
 * the frontend by `useTriggerChatTransport`. The model, system prompt, and the
 * five typed tools live in `lib/agent-config.ts` (orchestration-agnostic, so
 * the home stack can reuse them on Claude API direct). This file is only the
 * Trigger wrapper — the LLM runtime the deterministic `lib/router.ts` seam was
 * always a placeholder for. `lib/router.ts` + `/api/chat` remain as an offline
 * fallback path.
 */
import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { MODEL, SYSTEM, reefTools } from "../lib/agent-config";

export const reefChat = chat.agent({
  id: "reef-chat",
  tools: reefTools,
  run: async ({ messages, tools, signal }) =>
    streamText({
      // Spread FIRST — wires prepareStep (compaction/steering), telemetry, and
      // hands the typed tool set to streamText. Explicit fields below win.
      ...chat.toStreamTextOptions({ tools }),
      model: anthropic(MODEL),
      system: SYSTEM,
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(6),
    }),
});
