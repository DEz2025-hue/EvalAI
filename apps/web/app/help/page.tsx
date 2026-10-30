"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Member = { userId: string; role: string };

const GUIDES = [
  {
    title: "Start an assessment",
    body: "Open Assessments and choose New Solar or New CCTV. Give the site a name and address, pick the goal, and EvalAI creates the job with its checklist.",
    href: "/assessments/new",
    cta: "New assessment",
  },
  {
    title: "Work the checklist",
    body: "Open the job, then move through context, checklist, evidence, and measurements. Checklist items are editable per assessment, and every response is saved with its status.",
    href: "/assessments",
    cta: "Open assessments",
  },
  {
    title: "Capture evidence",
    body: "Add photos and voice notes from the evidence step. Files stay private to your workspace and are linked to the assessment that captured them.",
    href: "/assessments",
    cta: "Open assessments",
  },
  {
    title: "Generate and finalize the report",
    body: "Preview the report from the job, then finalize it. Finalized snapshots are immutable and versioned — later edits create a new version, never change the old one.",
    href: "/reports",
    cta: "View reports",
  },
  {
    title: "Manage sites and team",
    body: "Sites are created with your first job and can be renamed from the Sites page. Invite teammates by email from the Team page — they need an account first. Owners and admins can change roles.",
    href: "/team",
    cta: "Open team",
  },
];

const FAQS = [
  {
    q: "Where is my data stored?",
    a: "Signed-in workspaces persist to Supabase with workspace-scoped access rules. Without sign-in the app runs in demo mode with a local file fallback.",
  },
  {
    q: "Can I edit a finalized report?",
    a: "No — finalized snapshots are immutable by design. Keep working on the assessment and finalize a new version instead.",
  },
  {
    q: "Who can see my assessments?",
    a: "Only members of your workspace. Every API checks membership server-side, and switching workspaces changes exactly what you can see.",
  },
  {
    q: "How do inspections differ from assessments?",
    a: "They share the same workflow — checklist, evidence, measurements, report — but carry their own report title and are listed separately.",
  },
];

export default function HelpPage(): JSX.Element {
  const [supportRoles, setSupportRoles] = useState<string[] | null>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => {
        const members = (((d as { members?: Member[] }).members ?? []) as Member[]);
        const roles = [...new Set(members.filter((m) => m.role === "owner" || m.role === "admin").map((m) => m.role))];
        setSupportRoles(roles);
      })
      .catch(() => setSupportRoles([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Help & Support</h1>
        <p className="mt-1 text-sm text-slate-600">How EvalAI works, from first assessment to finalized report.</p>
      </div>

      <section aria-label="Guides" className="space-y-3">
        {GUIDES.map((g) => (
          <div key={g.title} className="card p-5">
            <h2 className="text-sm font-semibold">{g.title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{g.body}</p>
            <Link href={g.href} className="mt-2 inline-flex text-xs font-medium text-sky-700 hover:underline">{g.cta} →</Link>
          </div>
        ))}
      </section>

      <section aria-label="Frequently asked questions" className="card p-5">
        <h2 className="text-sm font-semibold">Frequently asked questions</h2>
        <div className="mt-3 space-y-4">
          {FAQS.map((f) => (
            <div key={f.q}>
              <div className="text-sm font-medium">{f.q}</div>
              <p className="mt-0.5 text-sm leading-6 text-slate-600">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Support" className="card p-5">
        <h2 className="text-sm font-semibold">Support</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Workspace access, roles, and billing-style questions are handled by your workspace owners
          {supportRoles && supportRoles.length > 0 ? ` (this workspace has ${supportRoles.join(" and ")} coverage)` : ""}.
          Reach them through the Team page.
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/team" className="btn-secondary text-xs">Open team</Link>
          <Link href="/settings" className="btn-secondary text-xs">Workspace settings</Link>
        </div>
      </section>
    </div>
  );
}
