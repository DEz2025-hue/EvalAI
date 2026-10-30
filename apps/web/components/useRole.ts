"use client";
import { useEffect, useState } from "react";

export type RoleInfo = { loaded: boolean; role: string | null; canWrite: boolean; isAdmin: boolean };

let cache: Promise<RoleInfo> | null = null;

function fetchRole(): Promise<RoleInfo> {
  if (!cache) {
    cache = fetch("/api/workspaces")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { workspaces?: Array<{ id: string; role: string }>; activeWorkspaceId?: string | null; demo?: boolean } | null) => {
        if (!d) return { loaded: true, role: null, canWrite: false, isAdmin: false };
        if (d.demo) return { loaded: true, role: "demo", canWrite: true, isAdmin: true };
        const role = d.workspaces?.find((w) => w.id === d.activeWorkspaceId)?.role ?? null;
        return { loaded: true, role, canWrite: role === "owner" || role === "admin" || role === "member", isAdmin: role === "owner" || role === "admin" };
      })
      .catch(() => ({ loaded: true, role: null, canWrite: false, isAdmin: false }));
  }
  return cache;
}

/** Caller's role in the active workspace. UI-only convenience — the server enforces roles on every write. */
export function useRole(): RoleInfo {
  const [info, setInfo] = useState<RoleInfo>({ loaded: false, role: null, canWrite: false, isAdmin: false });
  useEffect(() => {
    let live = true;
    fetchRole().then((r) => live && setInfo(r));
    return () => {
      live = false;
    };
  }, []);
  return info;
}

/** Call after switching workspace so the next render re-reads the role. */
export function resetRoleCache(): void {
  cache = null;
}
