import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { apiFetch } from "../../lib/api";

type Mode = "assessment" | "inspection";
type Pack = "solar" | "cctv";

export default function CreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; pack?: string }>();
  const initialMode: Mode = params.mode === "inspection" ? "inspection" : "assessment";
  const initialPack: Pack = params.pack === "cctv" ? "cctv" : "solar";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [pack, setPack] = useState<Pack>(initialPack);
  const [siteName, setSiteName] = useState("");
  const [address, setAddress] = useState("");
  const [goal, setGoal] = useState("");
  const [existingEquipment, setExistingEquipment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (siteName.trim().length < 2) {
      setError("Site name must be ≥2 chars.");
      return;
    }
    if (siteName.length > 100) {
      setError("Site name ≤100 chars.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, pack, siteName: siteName.trim(), address: address.trim() || undefined, goal: goal.trim() || undefined, existingEquipment: existingEquipment.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Could not create the job — please try again");
      router.push(("/assessments/" + data.id) as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 16, gap: 12 }}>
        <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>Create — {mode === "assessment" ? "Assessment" : "Inspection"} · {pack.toUpperCase()}</Text>
        <Text style={{ fontSize: 12, color: "#64748b" }}>Choose mode & pack, then site context. Draft is saveable and resumable. {mode === "assessment" ? "Assessment evaluates needs; inspection checks against scope — report titles differ." : "Inspection verifies against checklist — Not Checked ≠ Pass."}</Text>

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pressable onPress={() => setMode("assessment")} style={{ flex: 1, minWidth: 120, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: mode === "assessment" ? "#0f172a" : "#fff", borderWidth: 1, borderColor: mode === "assessment" ? "#0f172a" : "#e2e8f0" }}>
            <Text style={{ fontWeight: "700", fontSize: 12, color: mode === "assessment" ? "#fff" : "#0f172a" }}>Assessment</Text>
            <Text style={{ fontSize: 10, color: mode === "assessment" ? "#cbd5e1" : "#64748b" }}>evaluate & plan</Text>
          </Pressable>
          <Pressable onPress={() => setMode("inspection")} style={{ flex: 1, minWidth: 120, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: mode === "inspection" ? "#0f172a" : "#fff", borderWidth: 1, borderColor: mode === "inspection" ? "#0f172a" : "#e2e8f0" }}>
            <Text style={{ fontWeight: "700", fontSize: 12, color: mode === "inspection" ? "#fff" : "#0f172a" }}>Inspection</Text>
            <Text style={{ fontSize: 10, color: mode === "inspection" ? "#cbd5e1" : "#64748b" }}>check & verify</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["solar", "cctv"] as Pack[]).map((p) => (
            <Pressable key={p} onPress={() => setPack(p)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: pack === p ? "#f1f5f9" : "#fff", borderWidth: 1, borderColor: pack === p ? "#0ea5e9" : "#e2e8f0" }}>
              <Text style={{ fontWeight: "700", fontSize: 12, color: pack === p ? "#0ea5e9" : "#0f172a" }}>{PACK_TEMPLATES[p].label}</Text>
              <Text style={{ fontSize: 10, color: "#64748b" }}>{PACK_TEMPLATES[p].description}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#0f172a" }}>Site name *</Text>
          <TextInput value={siteName} onChangeText={setSiteName} placeholder="e.g. 12 Acacia Rd — roof" placeholderTextColor="#94a3b8" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#0f172a" }}>Address / location</Text>
          <TextInput value={address} onChangeText={setAddress} placeholder="Optional" placeholderTextColor="#94a3b8" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#0f172a" }}>Goal / scope</Text>
          <TextInput value={goal} onChangeText={setGoal} multiline placeholder="New install / existing / upgrade / repair — requested outcome, constraints" placeholderTextColor="#94a3b8" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, fontSize: 13, color: "#0f172a", backgroundColor: "#fff", minHeight: 60 }} />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#0f172a" }}>Known equipment (optional)</Text>
          <TextInput value={existingEquipment} onChangeText={setExistingEquipment} multiline placeholder="Panels/inverter/batteries — make, model, status if known" placeholderTextColor="#94a3b8" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, fontSize: 13, color: "#0f172a", backgroundColor: "#fff", minHeight: 60 }} />
        </View>

        <Pressable onPress={submit} disabled={saving} style={{ backgroundColor: saving ? "#94a3b8" : "#0ea5e9", paddingVertical: 12, borderRadius: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : null}
          <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Creating…" : "Create & open checklist"}</Text>
        </Pressable>

        {error ? <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#dc2626" }}>{error}</Text></View> : null}

        <Text style={{ fontSize: 11, color: "#94a3b8" }}>Saves as draft — resumable via Jobs → Resume. resume it anytime from Jobs.</Text>

        <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 10, padding: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#92400e" }}>Live Camera — Coming Soon</Text>
          <Text style={{ fontSize: 11, color: "#78350f" }}>Use photo capture for each checklist item instead. </Text>
        </View>
      </View>
    </ScrollView>
  );
}
