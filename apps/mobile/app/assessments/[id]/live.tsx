import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";
import { colors, radius, space } from "../../../lib/theme";
import { Banner, Button, Card, Icon, Loading, Screen, SectionHeader, Text } from "../../../components/ui";

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
 * Live camera placeholder (mobile).
 * This build has no viewfinder module (expo-camera is not installed, and a
 * native-module addition needs a dev-client rebuild + camera-permission flow).
 * The screen says so plainly and routes to the working alternative:
 * still-photo capture + suggestion-only analysis.
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
        setError("Live mode status isn't available right now — check your connection.");
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
    <Screen>
      <Stack.Screen options={{ title: "Live camera" }} />
      <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
        <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.warningSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name="videocam-off-outline" size={30} color={colors.warning} />
        </View>
        <Text variant="title">Coming soon</Text>
        <Text variant="caption" style={{ textAlign: "center", maxWidth: 300 }}>Live, guided camera isn't in the app yet. Nothing on this screen records or streams.</Text>
      </View>

      {loading ? <Loading /> : null}
      {error ? <Banner tone="warning" message={error} /> : null}
      {gate?.message ? <Banner tone="neutral" message={gate.message} /> : null}

      <Card>
        <SectionHeader title="What you can do today" subtitle="Take a still photo on the job, then ask for an AI suggestion. Suggestions are never treated as verified measurements." />
        <Button title="Back to job to take photos" icon="camera-outline" variant="accent" onPress={() => router.push(`/assessments/${String(id)}` as never)} />
      </Card>
    </Screen>
  );
}
