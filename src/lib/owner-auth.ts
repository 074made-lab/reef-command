/**
 * Owner authentication for the merchant cockpit.
 *
 * The gated surfaces — approving a label batch (spends money) and polling a
 * run's progress — must be owner-only. Before this, the approval route allowed
 * ANY caller unless REEF_ADMIN_TOKEN happened to be set, and the UI never sent
 * it, so configuring it 401'd the real UI while leaving it unset let anyone
 * approve a purchase (Codex R3-P1). This replaces that with a real, fail-closed
 * owner session:
 *
 *   - the cockpit is unlocked by presenting REEF_OWNER_TOKEN once (a passphrase);
 *   - the server sets an httpOnly, HMAC-signed session cookie — the secret never
 *     reaches the browser, so client JS can neither read nor forge it;
 *   - requireOwner() verifies that cookie on every gated call and FAILS CLOSED:
 *     no token configured → refuse (not allow-all); missing/invalid/expired
 *     cookie → reject; and it returns the operator recorded in the audit log.
 *
 * Node runtime only (node:crypto) — its callers are the default Node runtime.
 */
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const OWNER_COOKIE = "reef_owner";
const OPERATOR = "owner";
const TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
export const OWNER_TTL_SECONDS = TTL_MS / 1000;

export class OwnerAuthError extends Error {
  constructor(readonly reason: "unconfigured" | "unauthenticated", message: string) {
    super(message);
    this.name = "OwnerAuthError";
  }
}

/** The shared owner passphrase. Absent (or too short) ⇒ gated actions are
 *  refused — the fail-closed default. */
function ownerToken(): string | null {
  const t = process.env.REEF_OWNER_TOKEN;
  return t && t.length >= 8 ? t : null;
}

/** Signing key: an explicit REEF_OWNER_SECRET, else derived from the token so a
 *  single env var suffices for a local run. */
function signingKey(token: string): string {
  return process.env.REEF_OWNER_SECRET || `reef-owner:${token}`;
}

function sign(value: string, token: string): string {
  return createHmac("sha256", signingKey(token)).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Is the owner passphrase configured at all? Drives the gate's setup copy. */
export function ownerAuthConfigured(): boolean {
  return ownerToken() !== null;
}

/** Timing-safe check of a presented passphrase against REEF_OWNER_TOKEN. */
export function checkOwnerToken(presented: string): boolean {
  const token = ownerToken();
  return token !== null && safeEqual(presented, token);
}

/** Signed session value "<operator>.<expiresMs>.<hmac>", or null if unconfigured. */
export function mintSession(nowMs: number): string | null {
  const token = ownerToken();
  if (!token) return null;
  const body = `${OPERATOR}.${nowMs + TTL_MS}`;
  return `${body}.${sign(body, token)}`;
}

/** Verify a cookie value → operator, or null if missing/tampered/expired. */
export function verifySessionValue(value: string | undefined, nowMs: number): { operator: string } | null {
  const token = ownerToken();
  if (!token || !value) return null;
  const i = value.lastIndexOf(".");
  if (i < 0) return null;
  const body = value.slice(0, i), mac = value.slice(i + 1);
  if (!safeEqual(mac, sign(body, token))) return null;
  const [operator, expStr] = body.split(".");
  const exp = Number(expStr);
  if (!operator || !Number.isFinite(exp) || exp < nowMs) return null;
  return { operator };
}

/** Read + verify the session cookie. Throws OwnerAuthError on any failure. Call
 *  at the top of every gated server action / route handler. */
export async function requireOwner(nowMs = Date.now()): Promise<{ operator: string }> {
  if (!ownerAuthConfigured()) {
    throw new OwnerAuthError("unconfigured", "owner auth not configured — set REEF_OWNER_TOKEN");
  }
  const jar = await cookies();
  const session = verifySessionValue(jar.get(OWNER_COOKIE)?.value, nowMs);
  if (!session) throw new OwnerAuthError("unauthenticated", "owner session required");
  return session;
}
