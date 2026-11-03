"use client";

export function LiveCameraPlaceholder({ compact = false }: { compact?: boolean }): JSX.Element {
  return (
    <div className={`rounded-lg border ${compact ? "border-amber-200 bg-amber-50 p-3" : "border-slate-200 bg-slate-50 p-4"}`}>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden />
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Coming Soon</span>
        <span className="text-xs font-medium text-slate-700">Live Camera Analysis</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Live camera analysis on the web isn&apos;t available yet — no live stream is active here. A live session is in beta on the mobile app. On the web, use photo capture and on-demand analysis.
      </p>
    </div>
  );
}
