import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EvalAI — Assessments & Inspections",
  description: "Solar and CCTV site assessments, inspections, evidence, and reports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold tracking-wide text-white">EA</div>
              <span className="text-sm font-semibold tracking-tight">EvalAI</span>
              <span className="hidden text-xs text-slate-500 sm:inline">Solar · CCTV · Assessment · Inspection</span>
            </div>
            <nav className="flex items-center gap-2 text-sm">
              <a href="/" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">Dashboard</a>
              <a href="/assessments" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">Assessments</a>
              <a href="/inspections" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">Inspections</a>
              <a href="/reports" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">Reports</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">EvalAI · Private evidence · Server-side Meta AI adapter · Versioned reports</footer>
      </body>
    </html>
  );
}
