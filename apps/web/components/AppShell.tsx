"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const isAuthPage = pathname?.startsWith("/auth/") ?? false;

  async function signOut() {
    setSigningOut(true);
    try {
      const { createSupabaseBrowserClient } = await import("@eval-ai/supabase");
      await createSupabaseBrowserClient().auth.signOut();
    } catch {}
    router.push("/auth/sign-in");
  }

  if (isAuthPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="EvalAI home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold tracking-wide text-white">EA</span>
            <span>
              <span className="block text-sm font-semibold tracking-tight text-slate-900">EvalAI</span>
              <span className="hidden text-[11px] text-slate-500 sm:block">Inspection workspace</span>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-1 text-sm">
            <Link href="/" className="rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">Dashboard</Link>
            <Link href="/assessments" className="rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">Assessments</Link>
            <Link href="/inspections" className="hidden rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:inline-flex">Inspections</Link>
            <Link href="/reports" className="rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">Reports</Link>
            <Link href="/sites" className="hidden rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:inline-flex">Sites</Link>
            <Link href="/team" className="hidden rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:inline-flex">Team</Link>
            <button onClick={signOut} disabled={signingOut} className="rounded-lg px-3 py-2 font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">{signingOut ? "Signing out…" : "Sign out"}</button>
          </nav>
        </div>
      </header>
      <main className="mx-auto min-h-[calc(100vh-9rem)] max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs text-slate-500">
        EvalAI <span aria-hidden="true">·</span> Evidence stays private <span aria-hidden="true">·</span> Reports are versioned and shareable
      </footer>
    </>
  );
}
