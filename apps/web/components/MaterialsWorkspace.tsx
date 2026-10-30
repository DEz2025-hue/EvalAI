"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MaterialsList } from "./MaterialsList";
import { QuotationReview } from "./QuotationReview";

/** Materials + quotations with the REAL latest materials version (never a hard-coded 1). */
export function MaterialsWorkspace({ id, basePath }: { id: string; basePath: "/assessments" | "/inspections" }): JSX.Element {
  const [version, setVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadVersion = useCallback(async () => {
    try {
      const res = await fetch(`/api/materials?assessmentId=${id}`);
      const data = (await res.json().catch(() => ({}))) as { version?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load materials");
      setVersion(data.version ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setVersion(0);
    }
  }, [id]);

  useEffect(() => {
    loadVersion();
  }, [loadVersion]);

  if (version === null) return <div className="py-10 text-sm text-slate-500">Loading materials…</div>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Materials &amp; quotations · {id.slice(0, 8)}</h1>
        <p className="text-sm text-slate-600">Materials are traceable to measurements, findings or rules; quantities stay provisional when inputs are missing. Each quotation is tied to the exact materials version it priced, and goes stale when materials change. Prices are never invented.</p>
      </div>
      {error ? <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <div className="card p-4"><MaterialsList assessmentId={id} version={version} onChange={(_items, v) => setVersion(v)} /></div>
      <div className="card p-4"><QuotationReview key={version} assessmentId={id} materialsVersion={version} /></div>
      <div className="flex gap-2">
        <Link href={`${basePath}/${id}` as never} className="btn-secondary text-sm">Back</Link>
        <Link href={`${basePath}/${id}/report` as never} className="btn-primary text-sm">Report with materials</Link>
      </div>
    </div>
  );
}
