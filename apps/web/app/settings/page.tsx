"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getNotifPrefs, setNotifPrefs, type NotifPrefs } from "../../lib/prefs";

type Workspace = { id: string; name: string; role: string; createdAt: string };
type Member = { userId: string; role: string; createdAt: string };

export default function SettingsPage(): JSX.Element {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotifPrefs>(getNotifPrefs());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { createSupabaseBrowserClient } = await import("@eval-ai/supabase");
        const { data } = await createSupabaseBrowserClient().auth.getUser();
        setEmail(data.user?.email ?? null);
        setUserId(data.user?.id ?? null);
      } catch {}
      try {
        const [wsRes, teamRes] = await Promise.all([fetch("/api/workspaces"), fetch("/api/team")]);
        const wsData = (await wsRes.json().catch(() => ({}))) as { workspaces?: Workspace[]; activeWorkspaceId?: string };
        const teamData = (await teamRes.json().catch(() => ({}))) as { members?: Member[]; myRole?: string };
        setWorkspaces((wsData.workspaces ?? []) as Workspace[]);
        setActiveId(wsData.activeWorkspaceId ?? null);
        setMembers(((teamData.members ?? []) as Member[]));
        setMyRole(teamData.myRole ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  function updatePrefs(next: NotifPrefs) {
    setPrefs(next);
    setNotifPrefs(next);
  }

  async function switchTo(id: string) {
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
    setMsg(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; workspace?: { id: string } };
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      setMsg("Workspace created — switching to it now.");
      if (data.workspace?.id) await switchTo(data.workspace.id);
      else window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const active = workspaces?.find((w) => w.id === activeId) ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Your account, workspaces, and notification preferences.</p>
      </div>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div> : null}
      {msg ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{msg}</div> : null}

      <section aria-label="Account" className="card p-5">
        <h2 className="text-sm font-semibold">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium">{email ?? "Demo workspace (not signed in)"}</dd>
          </div>
          {userId ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">User ID</dt>
              <dd className="truncate font-mono text-xs">{userId}</dd>
            </div>
          ) : null}
          {myRole ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Role in this workspace</dt>
              <dd className="font-medium">{myRole}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 flex gap-2">
          <Link href="/team" className="btn-secondary text-xs">Manage team</Link>
          <Link href="/auth/sign-in" className="btn-secondary text-xs">Switch account</Link>
        </div>
      </section>

      <section aria-label="Workspaces" className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Workspaces</h2>
          <button onClick={createWorkspace} disabled={busy} className="btn-secondary text-xs disabled:opacity-50">+ New workspace</button>
        </div>
        {workspaces === null ? (
          <p className="mt-3 text-sm text-slate-500">Loading workspaces…</p>
        ) : workspaces.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            {email ? "You don't belong to any workspace yet — create one to get started." : "Sign in to create and switch between workspaces."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {workspaces.map((w) => (
              <li key={w.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{w.name}</div>
                  <div className="text-xs text-slate-500">{w.role}{members.length > 0 && w.id === activeId ? ` · ${members.length} member${members.length === 1 ? "" : "s"}` : ""}</div>
                </div>
                {w.id === active?.id ? (
                  <span className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">Active</span>
                ) : (
                  <button onClick={() => switchTo(w.id)} disabled={busy} className="btn-secondary text-xs disabled:opacity-50">Switch</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Notification preferences" className="card p-5">
        <h2 className="text-sm font-semibold">Notification preferences</h2>
        <p className="mt-1 text-xs text-slate-500">Choose which workspace signals appear in your notifications.</p>
        <div className="mt-3 space-y-2">
          {(
            [
              ["activity", "Workspace activity", "Creations, team changes, and other audit-trail events"],
              ["reports", "Finalized reports", "When a report snapshot is finalized"],
              ["reviews", "Ready for review", "Assessments waiting in review status"],
            ] as Array<[keyof NotifPrefs, string, string]>
          ).map(([key, label, hint]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => updatePrefs({ ...prefs, [key]: e.target.checked })}
                className="h-5 w-5 accent-slate-900"
                aria-label={label}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
