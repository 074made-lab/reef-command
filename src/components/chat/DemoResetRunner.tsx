"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ResetState = "confirm" | "resetting" | "locked" | "failed";

function clearReefCommandSession() {
  const keys = Array.from({ length: window.sessionStorage.length }, (_, index) =>
    window.sessionStorage.key(index),
  ).filter((key): key is string => Boolean(key?.startsWith("reef-command:")));
  keys.forEach((key) => window.sessionStorage.removeItem(key));
}

export function DemoResetRunner() {
  const [state, setState] = useState<ResetState>("resetting");
  const [passphrase, setPassphrase] = useState("");
  const [errorCopy, setErrorCopy] = useState("");
  const started = useRef(false);

  const reset = useCallback(async () => {
    setState("resetting");
    try {
      const response = await fetch("/api/demo/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET SYNTHETIC DEMO" }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (response.status === 401) {
        setState("locked");
        return;
      }
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Reset failed");
      clearReefCommandSession();
      window.location.replace("/merchant");
    } catch (error) {
      setErrorCopy(error instanceof Error ? error.message : "The reset response could not be verified.");
      setState("failed");
    }
  }, []);

  const unlockAndReset = useCallback(async () => {
    setState("resetting");
    try {
      const response = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: passphrase }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Owner unlock failed");
      setPassphrase("");
      await reset();
    } catch (error) {
      setErrorCopy(error instanceof Error ? error.message : "Owner unlock failed");
      setState("locked");
    }
  }, [passphrase, reset]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Auto-run ONLY when the confirmed header control set the one-shot intent.
    // A history/back-button/bookmark visit lands on an explicit confirm state
    // instead of silently re-running a ~15s destructive reset.
    const intent = window.sessionStorage.getItem("reef-command:reset-intent");
    window.sessionStorage.removeItem("reef-command:reset-intent");
    if (intent) void reset();
    else setState("confirm");
  }, [reset]);

  return (
    <main className="mx-auto flex min-h-[54vh] max-w-6xl items-center justify-center px-4 py-14 sm:px-6">
      <section className="w-full max-w-xl rounded-xl border border-line bg-panel p-7 shadow-[0_28px_70px_rgba(0,0,0,0.22)]" aria-live="polite">
        <div className="flex items-start gap-4">
          <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border ${state === "failed" ? "border-rose-400/55 text-rose-300" : "border-coral/60 text-coral"}`}>
            <span className={state === "resetting" ? "animate-spin text-xl" : "text-lg"}>{state === "confirm" ? "↺" : state === "resetting" ? "↻" : state === "locked" ? "⌁" : "!"}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-mute uppercase">Synthetic workspace</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              {state === "confirm" ? "Reset the synthetic demo?" : state === "resetting" ? "Restoring the demo…" : state === "locked" ? "Owner unlock required" : "Reset status is unconfirmed"}
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-dim">
              {state === "confirm"
                ? "This rebuilds the whole synthetic world (~15s) and returns to Sunday at 0/3. Nothing runs until you confirm."
                : state === "resetting"
                  ? "Rebuilding orders, shipments, requests, campaigns, and approvals. You’ll return to Sunday at 0/3 automatically."
                  : state === "locked"
                    ? "Enter the same owner passphrase used for gated business actions. It stays in this browser request and is never stored by the page."
                    : `${errorCopy || "The reset response could not be verified."} The server may have completed the reset; retrying is safe.`}
            </p>
            {state === "confirm" ? (
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => void reset()} className="rounded-md bg-coral px-3 py-2 text-[11px] font-bold tracking-[0.06em] text-abyss uppercase">
                  Reset now
                </button>
                <button type="button" onClick={() => window.location.replace("/merchant")} className="rounded-md border border-line px-3 py-2 text-[11px] font-semibold tracking-[0.06em] text-dim uppercase hover:text-ink">
                  Back to app
                </button>
              </div>
            ) : null}
            {state === "locked" ? (
              <form className="mt-5 flex max-w-sm gap-2" onSubmit={(event) => { event.preventDefault(); void unlockAndReset(); }}>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="owner passphrase"
                  autoComplete="current-password"
                  className="min-w-0 flex-1 rounded-md border border-line bg-abyss/55 px-3 py-2 text-[13px] text-ink outline-none focus:border-coral/70"
                />
                <button type="submit" disabled={!passphrase} className="rounded-md bg-coral px-3 py-2 text-[11px] font-bold tracking-[0.06em] text-abyss uppercase disabled:opacity-45">
                  Unlock
                </button>
              </form>
            ) : null}
            {state === "failed" ? (
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => void reset()} className="rounded-md bg-coral px-3 py-2 text-[11px] font-bold tracking-[0.06em] text-abyss uppercase">
                  Try again
                </button>
                <button type="button" onClick={() => window.location.replace("/merchant")} className="rounded-md border border-line px-3 py-2 text-[11px] font-semibold tracking-[0.06em] text-dim uppercase hover:text-ink">
                  Back to app
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
