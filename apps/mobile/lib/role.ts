import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export type RoleInfo = { loaded: boolean; role: string | null; canWrite: boolean; isAdmin: boolean };

/** Caller's role in the active workspace (UI convenience only — the server enforces roles on every write). */
export function useRole(): RoleInfo {
  const [info, setInfo] = useState<RoleInfo>({ loaded: false, role: null, canWrite: false, isAdmin: false });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await apiFetch("/api/workspaces");
        if (!res.ok) throw new Error("role lookup failed");
        const d = (await res.json()) as { workspaces?: Array<{ id: string; role: string }>; activeWorkspaceId?: string | null; demo?: boolean };
        if (!live) return;
        if (d.demo) return setInfo({ loaded: true, role: "demo", canWrite: true, isAdmin: true });
        const role = d.workspaces?.find((w) => w.id === d.activeWorkspaceId)?.role ?? null;
        setInfo({ loaded: true, role, canWrite: role === "owner" || role === "admin" || role === "member", isAdmin: role === "owner" || role === "admin" });
      } catch {
        if (live) setInfo({ loaded: true, role: null, canWrite: false, isAdmin: false });
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return info;
}
