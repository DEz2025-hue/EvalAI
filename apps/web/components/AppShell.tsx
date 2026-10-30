"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import SearchBox from "./SearchBox";
import NotificationsBell from "./NotificationsBell";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

type NavItem = { href: string; label: string; icon: JSX.Element };

function icon(path: string): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: icon("M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10") },
  { href: "/assessments", label: "Assessments", icon: icon("M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01") },
  { href: "/inspections", label: "Inspections", icon: icon("M9 12l2 2 4-4M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4z") },
  { href: "/sites", label: "Sites", icon: icon("M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11zM12 12h.01") },
  { href: "/reports", label: "Reports", icon: icon("M7 3h8l4 4v14H7zM15 3v4h4M10 12h5M10 16h5") },
  { href: "/team", label: "Team", icon: icon("M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M15 3.13a4 4 0 010 7.75") },
  { href: "/templates", label: "Templates", icon: icon("M4 5h16v14H4zM4 10h16M10 10v9") },
  { href: "/settings", label: "Settings", icon: icon("M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6") },
  { href: "/help", label: "Help & Support", icon: icon("M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01M12 22a10 10 0 100-20 10 10 0 000 20z") },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(email: string | null): string {
  if (!email) return "?";
  const name = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

export default function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const isAuthPage = pathname?.startsWith("/auth/") ?? false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createSupabaseBrowserClient } = await import("@eval-ai/supabase");
        const { data } = await createSupabaseBrowserClient().auth.getUser();
        if (!cancelled) setEmail(data.user?.email ?? null);
      } catch {
        if (!cancelled) setEmail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

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

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-3 px-5 pb-6 pt-5" aria-label="EvalAI home">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold tracking-wide text-white">EA</span>
        <span>
          <span className="block text-sm font-semibold tracking-tight text-slate-900">EvalAI</span>
          <span className="block text-[11px] text-slate-500">Inspection workspace</span>
        </span>
      </Link>
      <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map((item) => {
          const active = isActive(pathname ?? "/", item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active ? "bg-slate-900 font-semibold text-white" : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-4">
        <Link href="/assessments/new" className="btn-primary w-full text-sm">+ New Assessment</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-900/40" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <Link href="/" className="flex items-center gap-2.5 lg:hidden" aria-label="EvalAI home">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold tracking-wide text-white">EA</span>
                <span className="text-sm font-semibold tracking-tight text-slate-900">EvalAI</span>
              </Link>
              <span className="hidden text-sm font-medium text-slate-500 lg:block">
                {NAV.find((n) => isActive(pathname ?? "/", n.href))?.label ?? "Dashboard"}
              </span>
            </div>
            <div className="relative">
              <button
                onClick={() => setAccountOpen((v) => !v)}
                className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 transition hover:border-slate-300 hover:bg-slate-50"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label="Account menu"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white" aria-hidden="true">
                  {initialsOf(email)}
                </span>
                <span className="hidden max-w-40 truncate text-sm font-medium text-slate-700 sm:block">{email ?? "Account"}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4 text-slate-500" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {accountOpen ? (
                <>
                  <button aria-label="Close account menu" onClick={() => setAccountOpen(false)} className="fixed inset-0 z-40 cursor-default bg-transparent" />
                  <div role="menu" className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                    <div className="px-3 py-2">
                      <div className="text-xs text-slate-500">Signed in as</div>
                      <div className="truncate text-sm font-medium text-slate-900">{email ?? "Demo workspace"}</div>
                    </div>
                    <button
                      role="menuitem"
                      onClick={signOut}
                      disabled={signingOut}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                      </svg>
                      {signingOut ? "Signing out…" : "Sign out"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>
        <main className="mx-auto min-h-[calc(100vh-9rem)] w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs text-slate-500">
          EvalAI <span aria-hidden="true">·</span> Evidence stays private <span aria-hidden="true">·</span> Reports are versioned and shareable
        </footer>
      </div>
    </div>
  );
}
