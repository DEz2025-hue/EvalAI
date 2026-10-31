"use client";

import Link from "next/link";
import { useState } from "react";

type Ws = { id: string; name: string; role: string; memberCount: number };
type Plan = { deleteWorkspaces: Ws[]; blockers: Ws[]; leaveWorkspaces: Ws[] };

const CONFIRM_WORD = "DELETE";

/** Settings "danger zone": shows what deleting the account does, then deletes it after typed confirmation. */
export default function DeleteAccountSection(): JSX.Element {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account");
      const data = (await res.json().catch(() => ({}))) as Plan & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not check your account");
      setPlan(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete your account permanently? This can't be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: CONFIRM_WORD }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; blockers?: Ws[] };
      if (res.status === 409 && data.blockers) setPlan((p) => (p ? { ...p, blockers: data.blockers! } : p));
      if (!res.ok) throw new Error(data.error ?? "Could not delete your account");
      try {
        const { browserSupabase } = await import("../lib/supabase/browser");
        await browserSupabase().auth.signOut({ scope: "local" });
      } catch {
        /* the account is gone either way */
      }
      window.location.href = "/auth/sign-in?deleted=1";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  const blocked = !!plan && plan.blockers.length > 0;

  return (
    <section aria-label="Delete account" className="card border-red-200 p-5">
      <h2 className="text-sm font-semibold text-red-700">Delete account</h2>
      <p className="mt-1 text-xs text-slate-500">Permanently removes your sign-in. Workspaces only you belong to are deleted with everything in them; teams keep the work you did in shared workspaces.</p>
      {error ? <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {!plan ? (
        <button onClick={start} disabled={loading} className="mt-4 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
          {loading ? "Checking…" : "Delete my account…"}
        </button>
      ) : (
        <div className="mt-4 space-y-4 text-sm">
          {blocked ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
              <div className="font-medium">Hand over ownership first</div>
              <p className="mt-1 text-xs">You&apos;re the only owner of: {plan.blockers.map((w) => w.name).join(", ")}. Make someone else an owner on the <Link href="/team" className="underline">Team page</Link>, then come back.</p>
            </div>
          ) : null}
          {plan.deleteWorkspaces.length ? (
            <div>
              <div className="font-medium">Deleted with your account</div>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">{plan.deleteWorkspaces.map((w) => <li key={w.id}>{w.name} — jobs, photos, voice notes and reports</li>)}</ul>
            </div>
          ) : null}
          {plan.leaveWorkspaces.length ? (
            <div>
              <div className="font-medium">You&apos;ll leave</div>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">{plan.leaveWorkspaces.map((w) => <li key={w.id}>{w.name} ({w.memberCount} members) — your work stays, shown as by a deleted user</li>)}</ul>
            </div>
          ) : null}
          {!blocked ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">Type {CONFIRM_WORD} to confirm</span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={CONFIRM_WORD} autoComplete="off" className="mt-1 block w-40 px-3 py-2 text-sm" />
              </label>
              <button onClick={remove} disabled={deleting || typed.trim() !== CONFIRM_WORD} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
              <button onClick={() => { setPlan(null); setTyped(""); }} className="btn-secondary text-xs">Cancel</button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
