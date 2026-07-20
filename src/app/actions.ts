"use server";

/**
 * Server actions for the chat transport. Both run on the server, so the
 * browser never holds the Trigger.dev secret key. Per-user / per-plan
 * authorization would live here too.
 */
import { auth } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";

// Creates the Session + first run, returns a session-scoped PAT. Idempotent
// on (env, chatId) — concurrent calls converge to the same session.
export const startChatSession = chat.createStartSessionAction("reef-chat");

// Pure mint — a fresh session-scoped token. The transport calls this on
// 401/403 to refresh an expired token.
export async function mintChatAccessToken(chatId: string) {
  return auth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  });
}
