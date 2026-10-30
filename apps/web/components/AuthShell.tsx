import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-slate-950 px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div aria-hidden="true" className="absolute -right-36 -top-32 h-[34rem] w-[34rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -right-16 -top-12 h-[25rem] w-[25rem] rounded-full border border-white/10" />
        <Link href="/" className="relative flex w-fit items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xs font-bold tracking-wide text-slate-950">EA</span>
          <span className="text-lg font-semibold tracking-tight">EvalAI</span>
        </Link>
        <div className="relative max-w-xl pb-16">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Inspect with confidence</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">{title}</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">{description}</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["01", "Define the scope"],
              ["02", "Capture evidence"],
              ["03", "Deliver with clarity"],
            ].map(([number, label]) => (
              <div key={number} className="border-t border-white/20 pt-3">
                <span className="text-xs font-semibold text-teal-300">{number}</span>
                <p className="mt-1 text-sm font-medium text-slate-200">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-400">A clearer path from field observations to professional reports.</p>
      </aside>
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-12">
        <Link href="/" className="flex w-fit items-center gap-2 lg:hidden">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">EA</span>
          <span className="text-sm font-semibold tracking-tight">EvalAI</span>
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">
            <div className="mb-7">
              <p className="text-sm font-semibold text-teal-700">EvalAI workspace</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </div>
            {children}
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">Secure access to your inspection workspace</p>
      </section>
    </div>
  );
}
