"use client";

import { useEffect, useState } from "react";

export type Workspace = { id: string; name: string; role: string; createdAt: string };

export default function WorkspaceSwitcher(): JSX.Element | null {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((d) => {
        if ((d as { demo?: boolean }).demo) {
          setWorkspaces([]);
          return;
        }
        setWorkspaces(((d as { workspaces?: Workspace[] }).workspaces ?? []) as Workspace[]);
        setActiveId((d as { activeWorkspaceId?: string }).activeWorkspaceId ?? null);
      })
      .catch(() => setWorkspaces([]));
  }, []);

  if (workspaces === null || workspaces.length === 0) return null;

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  async function switchTo(id: string) {
    if (id === active.id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Switch failed");
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function createWorkspace() {
    const name = window.prompt("Name for the new workspace:");
    if (!name || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; workspace?: { id: string } };
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      const newId = data.workspace?.id;
      if (newId) await switchTo(newId);
      else window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-52 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm transition hover:border-slate-300 hover:bg-slate-50"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
        title={active.name}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white" aria-hidden="true">
          {active.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate font-medium text-slate-700">{active.name}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <>
          <button aria-label="Close workspace menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-transparent" />
          <div role="listbox" aria-label="Workspaces" className="absolute left-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            {workspaces.map((w) => (
              <button
                key={w.id}
                role="option"
                aria-selected={w.id === active.id}
                onClick={() => switchTo(w.id)}
                disabled={busy}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100 disabled:opacity-50 ${
                  w.id === active.id ? "font-semibold text-slate-900" : "text-slate-600"
                }`}
              >
                <span className="truncate">{w.name}</span>
                <span className="ml-2 shrink-0 text-xs text-slate-400">{w.id === active.id ? "Active" : w.role}</span>
              </button>
            ))}
            <div className="mt-1 border-t border-slate-100 pt-1">
              <button onClick={createWorkspace} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-sky-700 transition hover:bg-sky-50 disabled:opacity-50">
                + New workspace
              </button>
            </div>
            {error ? <div className="px-3 py-1.5 text-xs text-red-600">{error}</div> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
