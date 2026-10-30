"use client";
import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@eval-ai/supabase";
import AuthShell from "../../../components/AuthShell";

export default function WebRecovery(): JSX.Element {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setError("Recovery isn’t configured yet. Please try again later.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset` });
      if (err) throw new Error(err.message);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Reset your password" description="Enter your account email and we will send a secure recovery link if an account exists.">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/[0.04] sm:p-8">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Email address</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 w-full px-3.5 py-3 text-sm" />
        </label>
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div> : null}
        {sent ? <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-teal-800">If an account exists for that email, a recovery link has been sent.</div> : null}
        <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Sending..." : "Send recovery link"}</button>
        <Link href="/auth/sign-in" className="block text-center text-sm font-semibold text-teal-700 hover:text-teal-900">Back to sign in</Link>
      </form>
    </AuthShell>
  );
}
