/**
 * Reef Command chat agent — the LLM brain as a durable Trigger.dev task.
 *
 * A `chat.agent()` running Claude (Sonnet) via the Vercel AI SDK, driven from
 * the frontend by `useTriggerChatTransport`. The read/review tools + model +
 * system prompt live in `lib/agent-config.ts` (orchestration-agnostic). The
 * write-side tool, `prepareLabelDay`, is Trigger-native: it fires the durable
 * label-day run (which pauses on a human waitpoint) and renders the manifest
 * with a gated approve chip, so it lives here alongside the Trigger wiring.
 * `lib/router.ts` + `/api/chat` remain as an offline fallback path.
 */
import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { MODEL, SYSTEM, reefTools } from "../lib/agent-config";
import { pgPool } from "../lib/store/postgres";
import { buildManifest, manifestSpec } from "../lib/label-day";
import { labelDay } from "./label-day";

const prepareLabelDay = tool({
  description:
    "Call this only when the owner explicitly asks to PREPARE, RUN, or BUILD the label batch/manifest, such as 'Run label day', 'prepare the shipping-label batch', or 'run the manifest'. Do NOT call it for order exceptions, customer messages, holds, address changes, or anything to clear before label approval; those belong to whatNeedsAttention. This fires the durable label-day run, pauses for approval, and renders weights, packs, cost, and a gated Approve chip.",
  inputSchema: z.object({}),
  execute: async () => {
    // Build ONCE, then hand the exact manifest to the run — the card the owner
    // approves is the payload the task buys (no build-twice race; R2-M1).
    const manifest = await buildManifest(pgPool());
    const handle = await labelDay.trigger({ manifest });
    return [manifestSpec(manifest, handle.id)];
  },
  toModelOutput: () => ({
    type: "text" as const,
    value:
      "Rendered the label-day manifest (weights, weather packs, total cost). The durable run is paused on a waitpoint, awaiting the owner's one-click batch approval.",
  }),
});

const tools = { ...reefTools, prepareLabelDay };

export const reefChat = chat.agent({
  id: "reef-chat",
  tools,
  // Never leak stack traces / internals to the browser (the SDK's default does).
  uiMessageStreamOptions: {
    onError: () => "The agent hit an internal error — please try again.",
  },
  run: async ({ messages, tools, signal }) =>
    streamText({
      // Spread FIRST — wires prepareStep (compaction/steering), telemetry, and
      // hands the typed tool set to streamText. Explicit fields below win.
      ...chat.toStreamTextOptions({ tools }),
      model: anthropic(MODEL),
      // Give the agent "now" so it reasons about live vs closed phases (the
      // auction verdict must not call a closed board "heading into close").
      system: `${SYSTEM}\n\nCurrent time (UTC): ${new Date().toISOString()}. Tools also carry explicit state (e.g. an auction's live/closed) — trust it over your own reading of a timestamp.`,
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(6),
    }),
});
