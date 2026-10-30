"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getNotifPrefs, getLastSeen, setLastSeen, scopeKey } from "../lib/prefs";

type AuditEvent = { id: string; action: string; targetType: string | null; targetId: string | null; createdAt: string };
type Job = { id: string; siteName?: string; mode: string; status: string; context?: Record<string, unknown>; createdAt?: string; updatedAt?: string };
type Snap = { id: string; assessmentId: string; finalized: boolean; createdAt: string };

type Item = { id: string; kind: "activity" | "reports" | "reviews"; title: string; detail: string; href: string; at: string };

function humanize(action: string): string {
  const map: Record<string, string> = {
    "assessment.created": "Assessment created",
    "assessment.finalized": "Assessment finalized",
    "report.finalized": "Report finalized",
    "member.invited": "Team member invited",
    "member.removed": "Team member removed",
  };
  if (map[action]) return map[action];
  if (action.startsWith("member.role:")) return `Team role set to ${action.split(":")[1] ?? ""}`.trim();
  return action.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsBell(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [scope, setScope] = useState("demo:anon");
  const [seenTick, setSeenTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [auditRes, snapRes, assessRes, teamRes] = await Promise.all([
        fetch("/api/audit?limit=20"),
        fetch("/api/reports/snapshot"),
        fetch("/api/assessments"),
        fetch("/api/team"),
      ]);
      const [auditData, snapData, assessData, teamData] = await Promise.all([
        auditRes.json().catch(() => ({})),
        snapRes.json().catch(() => ({})),
        assessRes.json().catch(() => ({})),
        teamRes.json().catch(() => ({})),
      ]);
      let email: string | null = null;
      try {
        const { createSupabaseBrowserClient } = await import("@eval-ai/supabase");
        const { data } = await createSupabaseBrowserClient().auth.getUser();
        email = data.user?.email ?? null;
      } catch {}
      const wsId = ((teamData as { workspaceId?: string }).workspaceId ?? null) as string | null;
      setScope(scopeKey(wsId, email));

      const out: Item[] = [];
      const events = (((auditData as { events?: AuditEvent[] }).events ?? []) as AuditEvent[]);
      for (const e of events) {
        const target = e.targetType && e.targetId ? ` · ${e.targetId.slice(0, 8)}` : "";
        out.push({
          id: `audit-${e.id}`,
          kind: "activity",
          title: humanize(e.action),
          detail: `${timeAgo(e.createdAt)}${target}`,
          href: e.targetType === "assessment" && e.targetId ? `/assessments/${e.targetId}` : "/",
          at: e.createdAt,
        });
      }
      const snaps = (((snapData as { snapshots?: Snap[] }).snapshots ?? []) as Snap[]).filter((s) => s.finalized);
      for (const s of snaps.slice(0, 5)) {
        out.push({
          id: `snap-${s.id}`,
          kind: "reports",
          title: "Report finalized",
          detail: `${timeAgo(s.createdAt)} · assessment ${s.assessmentId.slice(0, 8)}`,
          href: `/assessments/${s.assessmentId}/report`,
          at: s.createdAt,
        });
      }
      const jobs = (((assessData as { items?: Job[] }).items ?? []) as Job[]).filter((j) => j.status === "review");
      for (const j of jobs.slice(0, 5)) {
        const name = ((j.context as { siteName?: string } | undefined)?.siteName ?? j.siteName ?? j.id.slice(0, 8));
        out.push({
          id: `review-${j.id}`,
          kind: "reviews",
          title: `Ready for review: ${name}`,
          detail: `${j.mode} · ${timeAgo(j.updatedAt ?? j.createdAt ?? "")}`,
          href: `${j.mode === "inspection" ? "/inspections" : "/assessments"}/${j.id}`,
          at: j.updatedAt ?? j.createdAt ?? new Date(0).toISOString(),
        });
      }
      out.sort((a, b) => +new Date(b.at) - +new Date(a.at));
      setItems(out.slice(0, 15));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  const prefs = getNotifPrefs();
  const visible = useMemo(() => (items ?? []).filter((i) => prefs[i.kind]), [items]);
  const lastSeen = getLastSeen(scope);
  const unread = useMemo(
    () => visible.filter((i) => !lastSeen || +new Date(i.at) > +new Date(lastSeen)).length,
    [visible, lastSeen, seenTick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function markAllRead() {
    setLastSeen(scope, new Date().toISOString());
    setSeenTick((t) => t + 1);
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (items === null) load();
        }}
        className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <button aria-label="Close notifications" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-transparent" />
          <div role="menu" aria-label="Notifications" className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              <div className="flex items-center gap-2">
                <button onClick={markAllRead} className="text-xs font-medium text-sky-700 hover:underline">Mark all read</button>
                <Link href="/settings" onClick={() => setOpen(false)} className="text-xs font-medium text-slate-500 hover:underline">Settings</Link>
              </div>
            </div>
            {items === null ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">Loading…</div>
            ) : visible.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">You&apos;re all caught up — no new workspace activity.</div>
            ) : (
              <ul className="max-h-96 overflow-y-auto py-1.5">
                {visible.map((i) => {
                  const isNew = !lastSeen || +new Date(i.at) > +new Date(lastSeen);
                  return (
                    <li key={i.id}>
                      <Link href={i.href} onClick={() => setOpen(false)} className="flex gap-2.5 px-4 py-2.5 transition hover:bg-slate-50">
                        {isNew ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-600" aria-label="Unread" /> : <span className="w-2 shrink-0" />}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">{i.title}</span>
                          <span className="block truncate text-xs text-slate-500">{i.detail}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
