"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@eval-ai/supabase";
import AuthShell from "../../../components/AuthShell";

export default function WebSignUp(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!email.trim() || password.length < 6) {
      setError("Email and a password of at least 6 characters are required.");
      return;
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setError("Sign-up isn’t configured yet. Please try again later.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signErr } = await supabase.auth.signUp({ email: email.trim(), password });
      if (signErr) throw new Error(signErr.message);
      setOk("Account created — check your email for a confirmation link if required, then sign in.");
      setTimeout(() => router.push("/auth/sign-in"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create your account" description="Set up secure access to your inspection workspace.">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/[0.04] sm:p-8">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Email address</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 w-full px-3.5 py-3 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <div className="relative mt-1">
            <input type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="w-full px-3.5 py-3 pr-20 text-sm" />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-3 text-xs font-semibold text-slate-500 hover:text-slate-900">{show ? "Hide" : "Show"}</button>
          </div>
        </label>
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div> : null}
        {ok ? <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-teal-800">{ok}</div> : null}
        <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Creating…" : "Create account"}</button>
        <div className="text-center text-sm text-slate-500">
          Already registered? <Link href="/auth/sign-in" className="font-semibold text-teal-700 hover:text-teal-900">Sign in</Link>
        </div>
      </form>
    </AuthShell>
  );
}
