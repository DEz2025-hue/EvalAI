"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@eval-ai/supabase";
import AuthShell from "../../../components/AuthShell";

export default function WebSignIn(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    const hasEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!hasEnv) {
      setError("Sign-in isn’t configured yet. Please contact your administrator or try again later.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authErr) throw new Error(authErr.message);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Welcome back" description="Sign in to continue managing inspections, evidence, and reports.">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/[0.04] sm:p-8">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Email address</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 w-full px-3.5 py-3 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <div className="relative mt-1">
            <input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className="w-full px-3.5 py-3 pr-20 text-sm" />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-3 text-xs font-semibold text-slate-500 hover:text-slate-900">{show ? "Hide" : "Show"}</button>
          </div>
        </label>
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div> : null}
        <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Signing in…" : "Sign in"}</button>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <Link href="/auth/sign-up" className="font-semibold text-teal-700 hover:text-teal-900">Create an account</Link>
          <Link href="/auth/recovery" className="text-slate-500 hover:text-slate-900">Forgot password?</Link>
        </div>
      </form>
    </AuthShell>
  );
}
