import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";

type Gate = {
  status: string;
  feature: string;
  available: boolean;
  message: string;
  manualFrameCapture?: { available: boolean; analysisAvailable: boolean; how: string; analysisNote: string };
  gate?: { required: string[] };
  alternatives_today?: string[];
};

/**
 * Honest gated live camera (mobile).
 * This build has no viewfinder module (expo-camera is not installed, and a
 * native-module addition needs a dev-client rebuild + camera-permission flow).
 * This screen reports the live capability gate honestly and routes to the
 * working alternative: still-photo capture + suggestion-only analysis.
 */
export default function MobileLive() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [gate, setGate] = useState<Gate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        apiBase();
      } catch {
        setError("Set EXPO_PUBLIC_APP_URL to check live capability.");
        return;
      }
      const res = await apiFetch("/api/live/status");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Status check failed");
      setGate(data as Gate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>Live camera — {String(id).slice(0, 8)}</Text>
      <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 12, padding: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 12, color: "#92400e" }}>No live viewfinder in this build</Text>
        <Text style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>
          Continuous guidance is gated, and this app binary has no camera viewfinder module (expo-camera not installed — adding one needs a native rebuild plus a permission/consent flow). Nothing here pretends to stream.
        </Text>
      </View>

      {loading ? <View style={{ padding: 16, alignItems: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Checking capability…</Text></View> : null}
      {error ? <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#dc2626" }}>{error}</Text></View> : null}

      {gate ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 6 }}>
          <Text style={{ fontSize: 12, color: "#475569" }}>{gate.message}</Text>
          {gate.manualFrameCapture ? (
            <Text style={{ fontSize: 12, color: "#475569" }}>
              Web app today: {gate.manualFrameCapture.how} {gate.manualFrameCapture.analysisNote}
            </Text>
          ) : null}
          {gate.gate?.required?.length ? (
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#0f172a" }}>Gate to continuous guidance:</Text>
              {gate.gate.required.slice(0, 4).map((r, i) => (
                <Text key={i} style={{ fontSize: 11, color: "#64748b" }}>• {r}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 8 }}>
        <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Working alternative today</Text>
        <Text style={{ fontSize: 12, color: "#64748b" }}>Capture a still photo on the job hub, then request analysis — suggestion only, never a verified measurement.</Text>
        <Pressable onPress={() => router.push(`/assessments/${String(id)}` as never)} style={{ backgroundColor: "#0ea5e9", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Back to job hub → photo analysis</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
