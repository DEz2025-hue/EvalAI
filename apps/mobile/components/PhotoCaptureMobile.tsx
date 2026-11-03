import { useState } from "react";
import { View, Image, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadEvidence } from "../lib/upload";
import { readLocalFile, toBase64 } from "../lib/localFile";
import { photoAnalysisText, type PhotoAnalysis } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../lib/api";
import { colors, radius, space } from "../lib/theme";
import { Badge, Banner, Button, Card, IconButton, Text } from "./ui";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;
/** How many photos can wait in the list at once. */
const MAX_PHOTOS = 10;

type Shot = {
  key: string;
  uri: string;
  name: string;
  mime: string;
  status: "ready" | "uploading" | "uploaded" | "error";
  error?: string;
  analysis?: string;
};

/**
 * Add photos to a job: take several, or choose many at once from the gallery, then upload them together. Each photo
 * keeps its own status, so one failure never loses the others, and "Ask AI" works on any single photo.
 */
export function PhotoCaptureMobile({ assessmentId, itemId, onUploaded }: { assessmentId: string; itemId?: string; onUploaded?: (count: number) => void }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (key: string, change: Partial<Shot>) => setShots((prev) => prev.map((s) => (s.key === key ? { ...s, ...change } : s)));

  async function pick(which: "camera" | "library") {
    setError(null);
    const room = MAX_PHOTOS - shots.length;
    if (room <= 0) return;
    const perm = which === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "Allow camera or photo access in Settings to add photos to this job.");
      return;
    }
    const res =
      which === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false, allowsMultipleSelection: true, selectionLimit: room, orderedSelection: true });
    if (res.canceled) return;
    const added: Shot[] = [];
    let skipped = 0;
    res.assets.slice(0, room).forEach((a, i) => {
      if ((a.mimeType && !ALLOWED.includes(a.mimeType)) || (a.fileSize ?? 0) > MAX_BYTES) {
        skipped += 1;
        return;
      }
      added.push({ key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`, uri: a.uri, name: a.fileName ?? `photo-${Date.now()}-${i}.jpg`, mime: a.mimeType ?? "image/jpeg", status: "ready" });
    });
    if (added.length > 0) setShots((prev) => [...prev, ...added]);
    if (skipped > 0) setError(`${skipped} photo${skipped > 1 ? "s were" : " was"} skipped (only JPEG, PNG or WebP under 15 MB).${added.length ? " The others were added." : ""}`);
  }

  async function uploadAll() {
    const todo = shots.filter((s) => s.status === "ready" || s.status === "error");
    if (todo.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      apiBase();
    } catch {
      setUploading(false);
      Alert.alert("Upload pending", "The photos are on this phone. They need to be uploaded once you're connected.");
      return;
    }
    let ok = 0;
    for (const s of todo) {
      patch(s.key, { status: "uploading", error: undefined });
      try {
        await uploadEvidence({ assessmentId, itemId, uri: s.uri, fileName: s.name, mimeType: s.mime });
        patch(s.key, { status: "uploaded" });
        ok += 1;
      } catch (e) {
        patch(s.key, { status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }
    setUploading(false);
    if (ok > 0) onUploaded?.(ok);
  }

  async function askAi(s: Shot) {
    patch(s.key, { analysis: "Analyzing…" });
    try {
      try {
        apiBase();
      } catch {
        patch(s.key, { analysis: "AI photo analysis isn't available right now." });
        return;
      }
      // Read the file with expo-file-system (React Native's fetch can return an empty body for local files).
      const bytes = await readLocalFile(s.uri);
      if (bytes.byteLength === 0) throw new Error("The photo couldn't be read from this phone.");
      const res = await apiFetch("/api/ai/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The server reads the photo for this job and this checklist item (D-035).
        body: JSON.stringify({ imageBase64: toBase64(bytes), mimeType: s.mime, assessmentId, itemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analysis failed");
      patch(s.key, { analysis: photoAnalysisText(data as PhotoAnalysis) });
    } catch (e) {
      patch(s.key, { analysis: `Analysis unavailable: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  const waiting = shots.filter((s) => s.status === "ready" || s.status === "error").length;
  const full = shots.length >= MAX_PHOTOS;

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title={shots.length ? "Take another" : "Take photo"} icon="camera" onPress={() => void pick("camera")} disabled={full} style={{ flex: 1 }} />
        <Button title="Choose photos" icon="images-outline" variant="secondary" onPress={() => void pick("library")} disabled={full} style={{ flex: 1 }} />
      </View>
      {shots.length > 0 ? <Text variant="caption">{shots.length} of {MAX_PHOTOS} photos in the list{waiting > 0 ? ` · ${waiting} not uploaded yet` : ""}</Text> : null}

      {shots.map((s) => (
        <Card key={s.key}>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Image source={{ uri: s.uri }} style={{ width: 84, height: 112, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }} resizeMode="cover" />
            <View style={{ flex: 1, gap: space.xs }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {s.status === "uploaded" ? <Badge label="Uploaded" tone="success" /> : null}
                {s.status === "uploading" ? <Badge label="Uploading…" tone="info" /> : null}
                {s.status === "error" ? <Badge label="Not uploaded" tone="danger" /> : null}
                {s.status === "ready" ? <Badge label="Ready" tone="neutral" /> : null}
                <View style={{ flex: 1 }} />
                <IconButton icon="close" label="Remove photo" onPress={() => setShots((prev) => prev.filter((x) => x.key !== s.key))} />
              </View>
              {s.error ? <Text variant="caption" color={colors.danger}>{s.error}</Text> : null}
              <Button title="Ask AI" icon="sparkles-outline" variant="secondary" size="sm" onPress={() => void askAi(s)} />
            </View>
          </View>
          {s.analysis ? <Banner tone="warning" title="AI suggestion — not a verified measurement" message={s.analysis} /> : null}
        </Card>
      ))}

      {waiting > 0 ? <Button title={uploading ? "Uploading…" : waiting > 1 ? `Upload ${waiting} photos` : "Upload photo"} icon="cloud-upload-outline" variant="accent" onPress={() => void uploadAll()} loading={uploading} /> : null}
      {shots.length > 0 && waiting === 0 && !uploading ? (
        <Button title="Clear list" variant="ghost" onPress={() => setShots([])} />
      ) : null}

      {error ? <Banner tone="danger" message={error} /> : null}
      <Text style={{ fontSize: 11, color: colors.textSubtle }}>Photos are stored privately and only shared with people in your workspace.</Text>
    </View>
  );
}
