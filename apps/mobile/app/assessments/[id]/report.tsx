import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Linking } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";

type Snap = { id: string; assessmentId: string; assessmentVersion: number; checklistVersion: string; materialsVersion: number | null; quotationVersion: number | null; finalized: boolean; createdAt: string; htmlPreview?: string };

export default function MobileReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const fetchSnaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        apiBase();
      } catch {
        setSnaps([]);
        setError("Set EXPO_PUBLIC_APP_URL to list snapshots from web.");
        return;
      }
      const res = await apiFetch(`/api/reports/snapshot?assessmentId=${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load");
      setSnaps(((data as { snapshots?: Snap[] }).snapshots ?? []) as Snap[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchSnaps(); }, [fetchSnaps]);
  useFocusEffect(useCallback(() => { fetchSnaps(); }, [fetchSnaps]));

  async function createAndDownload(finalize: boolean, includeMaterials: boolean) {
    setDownloading(true);
    try {
      try {
        apiBase();
      } catch {
        Alert.alert("Configure API", "Set EXPO_PUBLIC_APP_URL to generate PDF (uses web’s deterministic pdf-lib).");
        return;
      }
      const snapRes = await apiFetch("/api/reports/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: id, includeMaterials, finalize }),
      });
      const snapData = await snapRes.json().catch(() => ({}));
      if (!snapRes.ok) throw new Error((snapData as { error?: string }).error ?? "Snapshot failed");
      const snapshotId = (snapData as { snapshot: Snap }).snapshot.id;
      const pdfRes = await apiFetch("/api/reports/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId }) });
      const data = await pdfRes.json().catch(() => ({}));
      if (!pdfRes.ok) throw new Error((data as { error?: string }).error ?? "PDF failed");
      const d = data as { pdfBase64: string; snapshot: Snap; signedUrl?: string; artifactKey?: string };
      // On mobile, open signedUrl if available, else note base64
      if (d.signedUrl) {
        await Linking.openURL(d.signedUrl);
        Alert.alert("Downloaded", `PDF via signed URL (${d.snapshot.finalized ? "finalized immutable" : "draft"})`);
      } else if (d.artifactKey) {
        Alert.alert("PDF ready", `Generated ${d.artifactKey} — open via Reports → signed URL when Storage configured. Snapshot ${d.snapshot.id.slice(0, 12)}`);
      } else {
        Alert.alert("PDF ready", `Base64 ${String(d.pdfBase64).length} chars — snapshot ${d.snapshot.id.slice(0, 12)}`);
      }
      await fetchSnaps();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>Report preview</Text>
          <Text style={{ fontSize: 12, color: "#64748b" }}>{String(id).slice(0, 8)} · versioned snapshot · immutable after finalize</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable onPress={() => createAndDownload(false, false)} disabled={downloading} style={{ flex: 1, minWidth: 120, backgroundColor: downloading ? "#94a3b8" : "#0ea5e9", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{downloading ? "Generating…" : "PDF without materials"}</Text>
        </Pressable>
        <Pressable onPress={() => createAndDownload(false, true)} disabled={downloading} style={{ flex: 1, minWidth: 120, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}>
          <Text style={{ fontWeight: "700", fontSize: 12, color: "#0f172a" }}>PDF with materials</Text>
        </Pressable>
        <Pressable onPress={() => Alert.alert("Finalize this report?", "A finalized report is immutable — later edits create a new version. It is refused while the completeness review has blockers.", [{ text: "Cancel", style: "cancel" }, { text: "Finalize", style: "destructive", onPress: () => void createAndDownload(true, true) }])} disabled={downloading} style={{ backgroundColor: "#f59e0b", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Finalize</Text>
        </Pressable>
      </View>

      {loading ? <View style={{ padding: 24, alignItems: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Loading snapshots…</Text></View> : null}
      {error ? <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#dc2626" }}>{error} — you can still generate a draft below.</Text></View> : null}

      {snaps.length ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: "700", fontSize: 12, color: "#0f172a" }}>Versioned snapshots — immutable after finalize</Text>
          {snaps.map((s) => (
            <View key={s.id} style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "#f8fafc", padding: 8, borderRadius: 8, borderWidth: 1, borderColor: "#e2e8f0" }}>
              <Text style={{ fontSize: 11, color: "#0f172a", flex: 1 }}>{s.id.slice(0, 12)} · v{s.assessmentVersion}{s.materialsVersion ? ` · mats v${s.materialsVersion}` : " · no mats"}</Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: s.finalized ? "#15803d" : "#92400e" }}>{s.finalized ? "finalized" : "draft"}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 11, color: "#64748b" }}>Later edits create new snapshots — finalized reports never mutate.</Text>
        </View>
      ) : !loading && !error ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: "#64748b" }}>No snapshots yet — generate one above.</Text>
          <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>First snapshot pins assessmentVersion/materialsVersion/quotationVersion.</Text>
        </View>
      ) : null}

      <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 12, padding: 12 }}>
        <Text style={{ fontSize: 12, color: "#92400e", fontWeight: "700" }}>Report without materials works</Text>
        <Text style={{ fontSize: 11, color: "#78350f", marginTop: 2 }}>Use “PDF without materials” for a report without a materials list (TEST_PLAN #34). Add materials via Materials screen, then “PDF with materials” (#35).</Text>
      </View>
    </ScrollView>
  );
}
