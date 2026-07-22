"use client";

import { useCallback, useEffect, useState } from "react";

/** Session-scoped completion state; the safe demo reset clears this namespace. */
export function usePersistentResolution(scope: string, allowedIds: string[]) {
  const key = `reef-command:resolved:${scope}`;
  const allowedKey = allowedIds.join("\u001f");
  const [resolved, setResolved] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const allowed = new Set(allowedKey ? allowedKey.split("\u001f") : []);
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as unknown;
      if (Array.isArray(stored)) {
        setResolved(new Set(stored.filter((id): id is string => typeof id === "string" && allowed.has(id))));
      }
    } catch {
      window.sessionStorage.removeItem(key);
    }
  }, [key, allowedKey]);

  const resolve = useCallback((id: string) => {
    setResolved((current) => {
      const next = new Set(current).add(id);
      window.sessionStorage.setItem(key, JSON.stringify([...next]));
      return next;
    });
  }, [key]);

  return { resolved, resolve };
}
