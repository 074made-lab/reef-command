/**
 * Owner unlock. POST { token } — if it matches REEF_OWNER_TOKEN, set the
 * httpOnly, HMAC-signed session cookie that gates the cockpit's money-moving
 * surfaces (approval + progress). The secret never leaves the server; the
 * browser only ever holds the signed opaque session. Fail-closed: no token
 * configured → 503 (refuse), wrong passphrase → 401.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  checkOwnerToken, mintSession, ownerAuthConfigured, OWNER_COOKIE, OWNER_TTL_SECONDS,
} from "@/lib/owner-auth";

// Naive per-process rate limit — enough for a single-owner local cockpit; not a
// distributed limiter. Slows passphrase guessing.
const ATTEMPTS = new Map<string, { n: number; resetAt: number }>();
const WINDOW_MS = 5 * 60_000, MAX = 8;

function limited(key: string, nowMs: number): boolean {
  const e = ATTEMPTS.get(key);
  if (!e || e.resetAt < nowMs) { ATTEMPTS.set(key, { n: 1, resetAt: nowMs + WINDOW_MS }); return false; }
  e.n += 1;
  return e.n > MAX;
}

export async function POST(req: Request) {
  const nowMs = Date.now();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  if (!ownerAuthConfigured()) {
    return NextResponse.json(
      { ok: false, error: "owner auth not configured — set REEF_OWNER_TOKEN in .env.local" },
      { status: 503 },
    );
  }
  if (limited(ip, nowMs)) {
    return NextResponse.json({ ok: false, error: "too many attempts — wait a few minutes" }, { status: 429 });
  }

  let token = "";
  try {
    token = String(((await req.json()) as { token?: unknown }).token ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  if (!checkOwnerToken(token)) {
    return NextResponse.json({ ok: false, error: "incorrect owner passphrase" }, { status: 401 });
  }

  const value = mintSession(nowMs);
  if (!value) {
    return NextResponse.json({ ok: false, error: "owner auth not configured" }, { status: 503 });
  }
  const jar = await cookies();
  jar.set(OWNER_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OWNER_TTL_SECONDS,
  });
  return NextResponse.json({ ok: true });
}
