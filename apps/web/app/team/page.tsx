"use client";
import { useEffect, useState } from "react";

type Member = { workspaceId: string; userId: string; role: string; createdAt: string };
type Audit = { id: string; actor: string | null; action: string; targetType: string | null; targetId: string | null; createdAt: string };

const ROLES = ["owner", "admin", "member", "viewer"];

export default function TeamPage(): JSX.Element {
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [wsName, setWsName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load team");
      setMembers(((data as { members?: Member[] }).members ?? []) as Member[]);
      setMyRole((data as { myRole?: string }).myRole ?? null);
      setWorkspaceId((data as { workspaceId?: string }).workspaceId ?? null);
      const aRes = await fetch("/api/audit?limit=50");
      const aData = await aRes.json().catch(() => ({}));
      if (aRes.ok) setAudit(((aData as { events?: Audit[] }).events ?? []) as Audit[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const canManage = myRole === "owner" || myRole === "admin";

  async function invite() {
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: inviteRole }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Invite failed");
      setMsg("Member added.");
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function setRole(userId: string, role: string) {
    setError(null);
    try {
      const res = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Role change failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(userId: string) {
    if (!confirm("Remove this member from the workspace? They lose access to all its jobs.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/team?userId=${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Remove failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createWorkspace() {
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: wsName }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Create failed");
      setMsg("Workspace created — you are its owner. Sign out and back in on mobile to see it, or switch via profile.");
      setWsName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-sm text-slate-500">Loading team…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Team {workspaceId ? <span className="text-xs font-normal text-slate-500">· {workspaceId.slice(0, 8)} · your role: {myRole ?? "—"}</span> : null}</h1>
      </div>
      {error ? <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {msg ? <div className="rounded bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">{msg}</div> : null}

      {members.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">Sign in to load your team — membership is workspace-scoped and RLS-enforced.</div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between p-3">
              <div>
                <div className="text-sm font-medium">{m.userId.slice(0, 8)}</div>
                <div className="text-xs text-slate-500">member since {new Date(m.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-2">
                {canManage ? (
                  <select value={m.role} onChange={(e) => setRole(m.userId, e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{m.role}</span>
                )}
                {canManage ? <button onClick={() => remove(m.userId)} className="text-xs text-red-600 hover:underline">Remove</button> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Invite member</h2>
          <p className="text-xs text-slate-500">They must already have an account — ask them to sign up first, then invite by email.</p>
          <div className="flex gap-2">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="viewer">viewer</option>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button onClick={invite} className="btn-primary text-sm">Invite</button>
          </div>
        </div>
      ) : null}

      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold">New workspace</h2>
        <div className="flex gap-2">
          <input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Workspace name" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={createWorkspace} className="btn-secondary text-sm">Create</button>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold">Audit trail · latest {audit.length}</h2>
        {audit.length === 0 ? (
          <p className="text-xs text-slate-500">No audited actions yet — assessment creation, finalization, evidence deletion, and finding reviews are recorded here.</p>
        ) : (
          <div className="space-y-1">
            {audit.map((a) => (
              <div key={a.id} className="text-xs text-slate-600">
                <span className="font-medium text-slate-900">{a.action}</span>
                {a.targetType ? <span> · {a.targetType} {a.targetId?.slice(0, 8)}</span> : null}
                <span className="text-slate-400"> · {new Date(a.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
