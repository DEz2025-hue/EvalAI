import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, Link, useFocusEffect } from "expo-router";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { apiFetch, apiBase } from "../../lib/api";
import { ChecklistEditorMobile } from "../../components/ChecklistEditorMobile";
import { PhotoCaptureMobile } from "../../components/PhotoCaptureMobile";
import { VoiceRecorderMobile } from "../../components/VoiceRecorderMobile";
import { MeasurementsPanelMobile } from "../../components/MeasurementsPanelMobile";
import { AiDraftPanelMobile } from "../../components/AiDraftPanelMobile";
import type { AssessmentRow } from "../../lib/types";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; row: AssessmentRow };

export default function AssessmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [storedItems, setStoredItems] = useState<Array<{ id: string; title: string; required: boolean; category?: string }> | null>(null);
  const readyId = state.kind === "ready" ? state.row.id : null;

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    if (!hasSupabaseEnv()) {
      // No env — show minimal demo so UI is still walkable
      setState({ kind: "ready", row: { id: String(id), workspace_id: "demo", site_id: null, mode: "assessment", pack: "solar", status: "draft", context: { siteName: String(id).slice(0, 8) }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sites: { name: String(id).slice(0, 12), address: "Demo — no Supabase" } } as AssessmentRow });
      return;
    }
    const supabase = getSupabase()!;
    setState({ kind: "loading" });
    try {
      const { data, error } = await supabase.from("assessments").select("id, workspace_id, site_id, mode, pack, status, context, created_at, updated_at, sites(name, address)").eq("id", id).single();
      if (error) throw new Error(error.message);
      setState({ kind: "ready", row: data as unknown as AssessmentRow });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);
  useFocusEffect(useCallback(() => { fetchDetail(); }, [fetchDetail]));

  // Load stored checklist items (builder edits) once the assessment is ready
  useEffect(() => {
    if (!readyId) return;
    let cancelled = false;
    (async () => {
      try {
        apiBase();
        const res = await apiFetch(`/api/checklist/items?assessmentId=${readyId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const list = (data as { items?: Array<{ id: string; title: string; required: boolean; category?: string }> }).items ?? [];
        if (list.length > 0 && !cancelled) setStoredItems(list);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [readyId]);

  if (state.kind === "loading") return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 }}><ActivityIndicator /><Text style={{ color: "#64748b", fontSize: 12 }}>Loading assessment…</Text></View>;
  if (state.kind === "error") return <View style={{ flex: 1, padding: 16, gap: 12 }}><Text style={{ color: "#dc2626", fontWeight: "700" }}>Couldn’t load assessment</Text><Text style={{ color: "#64748b", fontSize: 12 }}>{state.message}</Text><Pressable onPress={fetchDetail} style={{ backgroundColor: "#0f172a", padding: 12, borderRadius: 8, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text></Pressable></View>;

  // Stored items first (builder edits included); template only as fallback.
  const row = state.row;
  const pack = PACK_TEMPLATES[row.pack];
  const items = storedItems ?? pack.checklist.map((title, i) => ({ id: `${row.id}_item_${i}`, title, required: i < 5, category: i < 2 ? "Site" : "System" }));
  const siteName = row.sites?.name ?? (row.context as { siteName?: string })?.siteName ?? String(id).slice(0, 8);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
      <View style={{ backgroundColor: "#0f172a", borderRadius: 12, padding: 14 }}>
        <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "600", letterSpacing: 0.6 }}>{row.mode.toUpperCase()} · {row.pack.toUpperCase()} · {row.status}</Text>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 4 }}>{siteName}</Text>
        <Text style={{ color: "#cbd5e1", fontSize: 12, marginTop: 4 }}>{row.id.slice(0, 8)} · {pack.label} — {pack.description}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Link href={`/assessments/${row.id}/report`} asChild><Pressable style={{ flex: 1, backgroundColor: "#0ea5e9", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Preview report</Text></Pressable></Link>
        <Link href={`/assessments/${row.id}/findings` as never} asChild><Pressable style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}><Text style={{ fontWeight: "700", color: "#0f172a" }}>Findings</Text></Pressable></Link>
        <Link href={`/assessments/${row.id}/materials`} asChild><Pressable style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}><Text style={{ fontWeight: "700", color: "#0f172a" }}>Materials & quotes</Text></Pressable></Link>
      </View>

      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 6 }}>
        <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Context</Text>
        <Text style={{ fontSize: 12, color: "#64748b" }}>Site: {siteName}{row.sites?.address ? ` — ${row.sites.address}` : ""} · Pack: {row.pack} · Mode: {row.mode}</Text>
        <Text style={{ fontSize: 11, color: "#94a3b8" }}>Draft — you can resume it anytime.</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Link href={`/assessments/${row.id}/live` as never} asChild><Pressable style={{ flex: 1, backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}><Text style={{ fontWeight: "600", fontSize: 12, color: "#92400e" }}>Live camera</Text></Pressable></Link>
        <Link href={`/assessments/${row.id}/checklist`} asChild><Pressable style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}><Text style={{ fontWeight: "600", fontSize: 12, color: "#0f172a" }}>Checklist</Text></Pressable></Link>
        <Link href={`/assessments/${row.id}/evidence`} asChild><Pressable style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}><Text style={{ fontWeight: "600", fontSize: 12, color: "#0f172a" }}>Evidence</Text></Pressable></Link>
        <Link href={`/assessments/${row.id}/completeness`} asChild><Pressable style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}><Text style={{ fontWeight: "600", fontSize: 12, color: "#0f172a" }}>Completeness</Text></Pressable></Link>
      </View>

      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Checklist — editable · Not Checked ≠ Pass</Text>
        <Text style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Template from the {row.pack} pack — you can add, remove, or reorder items before you confirm.</Text>
        <View style={{ marginTop: 12 }}>
          <ChecklistEditorMobile items={items} assessmentId={row.id} />
        </View>
      </View>

      <MeasurementsPanelMobile assessmentId={row.id} />

      <PhotoCaptureMobile assessmentId={row.id} onUploaded={(k) => Alert.alert("Evidence linked", k.slice(0, 60))} />
      <VoiceRecorderMobile assessmentId={row.id} onTranscript={(t) => Alert.alert("Transcript attached", t.slice(0, 80))} />

      <AiDraftPanelMobile assessmentId={row.id} pack={row.pack} mode={row.mode} />

      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 8 }}>
        <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Report — versioned snapshot + PDF/HTML</Text>
        <Text style={{ fontSize: 12, color: "#64748b" }}>Generate from stored facts + validated drafts. Finalize creates immutable snapshot. Later edits do not mutate finalized reports.</Text>
        <Link href={`/assessments/${row.id}/report`} asChild><Pressable style={{ backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}><Text style={{ fontWeight: "600", fontSize: 12, color: "#0ea5e9" }}>Open HTML preview</Text></Pressable></Link>
      </View>

      <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 12, padding: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 12, color: "#92400e" }}>Live Camera — Coming Soon</Text>
        <Text style={{ fontSize: 11, color: "#78350f", marginTop: 2 }}>Not a working feature. No live stream, no background recording. Use photo capture per item.</Text>
      </View>
    </ScrollView>
  );
}
