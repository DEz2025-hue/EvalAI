import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export type RoleInfo = { loaded: boolean; role: string | null; canWrite: boolean; isAdmin: boolean };

const NONE: RoleInfo = { loaded: true, role: null, canWrite: false, isAdmin: false };
const TTL_MS = 30_000;

let cached: { at: number; info: RoleInfo } | null = null;
let inflight: Promise<RoleInfo> | null = null;

/** Forget the cached role (call after switching workspace or signing out). */
export function resetRole(): void {
  cached = null;
}

async function fetchRole(): Promise<RoleInfo> {
  try {
    const res = await apiFetch("/api/workspaces");
    if (!res.ok) throw new Error("role lookup failed");
    const d = (await res.json()) as { workspaces?: Array<{ id: string; role: string }>; activeWorkspaceId?: string | null; demo?: boolean };
    if (d.demo) return { loaded: true, role: "demo", canWrite: true, isAdmin: true };
    const role = d.workspaces?.find((w) => w.id === d.activeWorkspaceId)?.role ?? null;
    return { loaded: true, role, canWrite: role === "owner" || role === "admin" || role === "member", isAdmin: role === "owner" || role === "admin" };
  } catch {
    return NONE;
  }
}

/** One shared lookup: every component on a screen reuses the same in-flight request and a short-lived result. */
function loadRole(): Promise<RoleInfo> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.info);
  inflight ??= fetchRole().then((info) => {
    // A failed lookup is not cached, so the next screen retries.
    if (info.role !== null || info.canWrite) cached = { at: Date.now(), info };
    inflight = null;
    return info;
  });
  return inflight;
}

/** Caller's role in the active workspace (UI convenience only — the server enforces roles on every write). */
export function useRole(): RoleInfo {
  const [info, setInfo] = useState<RoleInfo>(() => (cached && Date.now() - cached.at < TTL_MS ? cached.info : { loaded: false, role: null, canWrite: false, isAdmin: false }));
  useEffect(() => {
    let live = true;
    void loadRole().then((r) => {
      if (live) setInfo(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return info;
}
