"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@eval-ai/supabase";
import AuthShell from "../../../components/AuthShell";

export default function WebResetPassword(): JSX.Element {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("This reset link has expired. Request a new one.");
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw new Error(err.message);
      setDone(true);
      setTimeout(() => router.push("/"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" description="Set a new password for your EvalAI account.">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/[0.04] sm:p-8">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">New password</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-3.5 py-3 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Confirm password</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 w-full px-3.5 py-3 text-sm" />
        </label>
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div> : null}
        {done ? <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-teal-800">Password updated. Redirecting…</div> : null}
        <button type="submit" disabled={loading || done} className="btn-primary w-full">{loading ? "Saving…" : "Update password"}</button>
        <Link href="/auth/sign-in" className="block text-center text-sm font-semibold text-teal-700 hover:text-teal-900">Back to sign in</Link>
      </form>
    </AuthShell>
  );
}
