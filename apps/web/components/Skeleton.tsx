import type { CSSProperties, ReactNode } from "react";

/**
 * Loading placeholders. A skeleton has the shape of the content that is coming, so the page does not jump when it arrives.
 * Every group is announced once to screen readers ("Loading…") and marked busy; the individual blocks are hidden from them.
 */

type BlockProps = { className?: string; style?: CSSProperties };

/** One placeholder block. Give it a size with Tailwind classes, e.g. `h-4 w-1/2`. */
export function Skeleton({ className = "", style }: BlockProps): JSX.Element {
  return <span aria-hidden="true" className={`skeleton ${className}`} style={style} />;
}

/** The wrapper for a group of placeholders: tells assistive technology what is loading. */
export function LoadingRegion({ label = "Loading…", children, className = "" }: { label?: string; children: ReactNode; className?: string }): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

const WIDTHS = ["w-full", "w-11/12", "w-4/5", "w-9/12", "w-2/3"];

/** Lines of text, the last one shorter. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }): JSX.Element {
  return (
    <div className={`space-y-2.5 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 && lines > 1 ? "w-2/5" : WIDTHS[i % WIDTHS.length]}`} />
      ))}
    </div>
  );
}

/** A card with a heading line and a few lines of text. */
export function SkeletonCard({ lines = 3, className = "" }: { lines?: number; className?: string }): JSX.Element {
  return (
    <div className={`card p-5 ${className}`} aria-hidden="true">
      <Skeleton className="mb-4 h-4 w-1/3" />
      <SkeletonText lines={lines} />
    </div>
  );
}

/** A list of rows: a small leading block, two lines, and a trailing pill. */
export function SkeletonList({ rows = 5, className = "" }: { rows?: number; className?: string }): JSX.Element {
  return (
    <div className={`card divide-y divide-slate-200/70 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={`h-4 ${i % 2 ? "w-2/3" : "w-1/2"}`} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** A row of figure tiles (counts at the top of a dashboard). */
export function SkeletonStats({ count = 4, className = "" }: { count?: number; className?: string }): JSX.Element {
  return (
    <div className={`grid grid-cols-2 gap-4 lg:grid-cols-4 ${className}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-5">
          <Skeleton className="mb-3 h-3 w-1/2" />
          <Skeleton className="h-8 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** A table: a header row and body rows. */
export function SkeletonTable({ rows = 5, cols = 4, className = "" }: { rows?: number; cols?: number; className?: string }): JSX.Element {
  return (
    <div className={`card overflow-hidden ${className}`} aria-hidden="true">
      <div className="flex gap-4 border-b border-slate-200/70 px-5 py-3.5">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-slate-200/50 px-5 py-4 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={`h-3.5 flex-1 ${(r + c) % 3 === 0 ? "w-3/4" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The page heading area: a title and a subtitle. */
export function SkeletonHeading({ className = "" }: { className?: string }): JSX.Element {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      <Skeleton className="h-7 w-1/3 max-w-xs" />
      <Skeleton className="h-4 w-1/2 max-w-md" />
    </div>
  );
}

/** A whole list page: heading, then rows. Used by the route-level loading screens. */
export function SkeletonListPage({ label, rows = 6 }: { label: string; rows?: number }): JSX.Element {
  return (
    <LoadingRegion label={label} className="space-y-6">
      <SkeletonHeading />
      <SkeletonList rows={rows} />
    </LoadingRegion>
  );
}

/** A whole detail page: heading, a summary card, then two content cards. */
export function SkeletonDetailPage({ label }: { label: string }): JSX.Element {
  return (
    <LoadingRegion label={label} className="space-y-6">
      <SkeletonHeading />
      <SkeletonCard lines={2} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </LoadingRegion>
  );
}
