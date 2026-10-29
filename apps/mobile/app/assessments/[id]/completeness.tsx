import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../../../lib/api";

type Resp = { itemId: string; status: string; measuredValue?: number };
type Item = { id: string; title: string; required: boolean };

export default function MobileCompleteness() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [responses, setResponses] = useState<Resp[]>([]);
  const [storedItems, setStoredItems] = useState<Item[] | null>(null);
  const [materialsCount, setMaterialsCount] = useState<number | null>(null);
  const [pack, setPack] = useState<"solar" | "cctv">("solar");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        apiBase();
        const res = await apiFetch(`/api/assessments/${String(id)}`).catch(() => null as unknown as Response);
        const data = (await res?.json().catch(() => ({}))) as { responses?: Resp[]; pack?: "solar" | "cctv"; checklist?: Item[] } | undefined;
        if (data?.responses) setResponses(data.responses);
        if (data?.pack) setPack(data.pack);
        if (data?.checklist?.length) setStoredItems(data.checklist);
        const matRes = await apiFetch(`/api/materials?assessmentId=${String(id)}`).catch(() => null as unknown as Response);
        if (matRes?.ok) {
          const md = await matRes.json().catch(() => ({}));
          setMaterialsCount(((md as { count?: number }).count ?? (md as { items?: unknown[] }).items?.length) ?? 0);
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, [id]);

  const summary = useMemo(() => {
    // Completeness over STORED items (builder edits included), not the raw template.
    const list = storedItems ?? PACK_TEMPLATES[pack].checklist.map((title, i) => ({ id: `${String(id)}_item_${i}`, title, required: i < 5 }));
    let pass = 0, fail = 0, attention = 0, na = 0, notChecked = 0, missingMeasure = 0;
    const byId: Record<string, string> = {};
    for (const r of responses) byId[r.itemId] = r.status;
    const blockers: string[] = [];
    const warnings: string[] = [];
    list.forEach(({ id: itemId, title }, i) => {
      const st = byId[itemId] ?? "not_checked";
      if (st === "pass") pass++; else if (st === "fail") fail++; else if (st === "needs_attention") attention++; else if (st === "not_applicable") na++; else notChecked++;
      const needsMeasure = title.toLowerCase().includes("measurement");
      const hasMeasure = responses.find((r) => r.itemId === itemId && r.measuredValue !== undefined);
      if (needsMeasure && !hasMeasure) missingMeasure++;
      if (st === "not_checked") blockers.push(`Item ${i + 1} “${title}” Not Checked`);
      if (st === "fail") warnings.push(`Item ${i + 1} “${title}” Fail — review evidence`);
      if (needsMeasure && !hasMeasure) warnings.push(`Missing measurement: ${title}`);
    });
    if (materialsCount === 0) warnings.push("No materials — can generate without (M18)");
    return { pass, fail, attention, na, notChecked, missingMeasure, blockers, warnings, total: list.length };
  }, [responses, materialsCount, pack, id, storedItems]);

  if (loading) return <View style={{ flex: 1, padding: 16, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Computing completeness…</Text></View>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>M17 · Completeness — {String(id).slice(0, 8)}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 80, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 10, alignItems: "center" }}><Text style={{ fontWeight: "800", fontSize: 18 }}>{summary.pass}</Text><Text style={{ fontSize: 11, color: "#64748b" }}>Pass</Text></View>
        <View style={{ flex: 1, minWidth: 80, backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 10, padding: 10, alignItems: "center" }}><Text style={{ fontWeight: "800", fontSize: 18, color: "#92400e" }}>{summary.notChecked}</Text><Text style={{ fontSize: 11, color: "#78350f" }}>Not Checked</Text></View>
        <View style={{ flex: 1, minWidth: 80, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: 10, alignItems: "center" }}><Text style={{ fontWeight: "800", fontSize: 18, color: "#dc2626" }}>{summary.fail}</Text><Text style={{ fontSize: 11, color: "#7f1d1d" }}>Fail</Text></View>
      </View>
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 6 }}>
        <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Blockers ({summary.blockers.length}) — must fix before finalize</Text>
        {summary.blockers.length === 0 ? <Text style={{ fontSize: 12, color: "#64748b" }}>No blockers.</Text> : summary.blockers.map((b, i) => <Text key={i} style={{ fontSize: 12, color: "#dc2626" }}>• {b}</Text>)}
      </View>
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 6 }}>
        <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Warnings ({summary.warnings.length})</Text>
        {summary.warnings.length === 0 ? <Text style={{ fontSize: 12, color: "#64748b" }}>No warnings.</Text> : summary.warnings.map((w, i) => <Text key={i} style={{ fontSize: 12, color: "#92400e" }}>• {w}</Text>)}
      </View>
      <Text style={{ fontSize: 11, color: "#64748b" }}>Not Checked ≠ complete. Recomputed from persisted data. Without-materials generation allowed.</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable onPress={() => router.push(`/assessments/${String(id)}/checklist` as never)} style={{ backgroundColor: "#0ea5e9", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Go to checklist</Text></Pressable>
        <Pressable onPress={() => router.push(`/assessments/${String(id)}/report` as never)} style={{ borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}><Text style={{ fontWeight: "600", fontSize: 12, color: "#0f172a" }}>Report</Text></Pressable>
      </View>
    </ScrollView>
  );
}
