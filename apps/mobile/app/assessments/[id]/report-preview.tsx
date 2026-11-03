import { createElement, useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { downloadGate, previewKey, type ReportInput } from "@eval-ai/shared";
import { apiFetch } from "../../../lib/api";
import { markPreviewed, previewedKeyFor } from "../../../lib/reportPreviewState";
import { downloadReportPdf } from "../../../lib/reportDownload";
import { colors, space } from "../../../lib/theme";
import { Banner, Button, ErrorState, Loading, Text } from "../../../components/ui";

type Snap = { id: string; finalized: boolean; htmlPreview?: string; payload?: ReportInput };

/**
 * The finished report as the person will get it (D-024): the same document the PDF is made from, full screen. A draft can be
 * downloaded only after it has been shown here in its current form, so nobody has to download to find out what it looks like.
 */
export default function MobileReportPreview() {
  const { id, snapshotId } = useLocalSearchParams<{ id: string; snapshotId: string }>();
  const router = useRouter();
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/reports/snapshot?snapshotId=" + String(snapshotId));
      const data = (await res.json().catch(() => ({}))) as { snapshot?: Snap; error?: string };
      if (!res.ok || !data.snapshot) throw new Error(data.error ?? "Could not load the report");
      setSnap(data.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [snapshotId]);
  useEffect(() => { void load(); }, [load]);

  // The report counts as previewed once its document has been drawn on the screen.
  const onShown = () => {
    if (!snap || shown) return;
    markPreviewed({ id: snap.id, finalized: snap.finalized, payload: snap.payload });
    setShown(true);
  };
  const gate = snap ? downloadGate({ id: snap.id, finalized: snap.finalized, payload: snap.payload }, shown ? previewKey({ id: snap.id, finalized: snap.finalized, payload: snap.payload }) : previewedKeyFor(snap.id)) : { locked: true, reason: null };

  const download = async () => {
    if (!snap) return;
    setBusy(true);
    setDownloadError(null);
    try {
      await downloadReportPdf(snap.id);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg }}><Stack.Screen options={{ title: "Preview" }} /><ErrorState title="Couldn't load the report" message={error} onRetry={load} /></View>;
  if (!snap) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg }}><Stack.Screen options={{ title: "Preview" }} /><Loading label="Loading the report…" /></View>;

  const html = snap.htmlPreview ?? "";
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: "Preview" }} />
      <View style={{ padding: space.md, gap: space.sm }}>
        {snap.finalized ? (
          <Banner tone="success" message="Final report — signed off and locked." />
        ) : (
          <Banner tone="warning" title="DRAFT — not signed off" message="This is exactly what the PDF will contain. If something is wrong, go back and edit, then preview again." />
        )}
      </View>
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        {html ? (
          Platform.OS === "web" ? (
            createElement("iframe", { title: "Report preview", sandbox: "", srcDoc: html, onLoad: onShown, style: { border: 0, width: "100%", height: "100%" } })
          ) : (
            <WebView originWhitelist={["about:blank"]} source={{ html }} javaScriptEnabled={false} domStorageEnabled={false} allowFileAccess={false} scalesPageToFit onLoadEnd={onShown} style={{ flex: 1 }} />
          )
        ) : (
          <View style={{ padding: space.lg }}><Text variant="body">This report has no preview. Go back and rebuild it.</Text></View>
        )}
      </View>
      <View style={{ padding: space.md, gap: space.sm }}>
        {downloadError ? <Banner tone="danger" message={downloadError} /> : null}
        {gate.locked && gate.reason ? <Text variant="caption">{gate.reason}</Text> : null}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title={snap.finalized ? "Back" : "Edit"} icon={snap.finalized ? "chevron-back" : "create-outline"} variant="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
          <Button title={busy ? "Preparing…" : "Download PDF"} icon="download-outline" variant="accent" onPress={() => void download()} loading={busy} disabled={gate.locked || busy} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}
