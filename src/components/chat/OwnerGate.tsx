"use client";

/**
 * Cockpit unlock. The merchant surface gates its money-moving actions behind an
 * owner session; this is where the owner presents the passphrase once. It POSTs
 * to /api/owner/login, which sets the signed httpOnly session cookie, then
 * reloads into the cockpit. The passphrase never persists in client state beyond
 * the request.
 */
import { useState } from "react";

export function OwnerGate({ configured }: { configured: boolean }) {
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !token) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(d.error ?? "sign-in failed");
    } catch {
      setErr("network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-md border border-line bg-panel p-5 shadow-lg"
      >
        <div className="text-[13px] font-mono uppercase tracking-widest text-tealhi">Reef Command</div>
        <h1 className="mt-1 text-[15px] font-semibold text-ink">Unlock the cockpit</h1>
        <p className="mt-2 text-[12px] leading-relaxed text-dim">
          Approving a label batch spends money, so the cockpit is owner-only. Enter
          the owner passphrase to start a session on this device.
        </p>

        <label htmlFor="owner-token" className="mt-4 block text-[12px] text-mute">
          Owner passphrase
        </label>
        <input
          id="owner-token"
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={!configured || busy}
          className="mt-1 w-full rounded-sm border border-line bg-raise px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-tealhi/70 disabled:opacity-60"
        />

        {err ? <p className="mt-2 text-[12px] text-danger">✕ {err}</p> : null}
        {!configured ? (
          <p className="mt-2 text-[12px] text-warn">
            REEF_OWNER_TOKEN is not set — add it to .env.local and restart to enable
            gated actions.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!configured || busy || !token}
          className="mt-4 inline-flex w-full items-center justify-center rounded-sm border border-coral/70 bg-coral/15 px-3 py-1.5 text-[13px] font-medium text-coralhi transition-colors hover:bg-coral/25 disabled:opacity-60"
        >
          {busy ? "unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
