import { useState } from "react";
import { View, Image, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadEvidence } from "../lib/upload";
import { apiFetch, apiBase } from "../lib/api";
import { colors, radius, space } from "../lib/theme";
import { Banner, Button, IconButton, Text } from "./ui";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;

export function PhotoCaptureMobile({ assessmentId, itemId, onUploaded }: { assessmentId: string; itemId?: string; onUploaded?: (key: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);

  async function pick(which: "camera" | "library") {
    setError(null);
    setAnalysis(null);
    const perm = which === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "Allow camera or photo access in Settings to add photos to this job.");
      return;
    }
    const res =
      which === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (asset.mimeType && !ALLOWED.includes(asset.mimeType)) {
      setError("Only JPEG, PNG or WebP photos are supported.");
      return;
    }
    if ((asset.fileSize ?? 0) > MAX_BYTES) {
      setError("That photo is too large (over 15 MB).");
      return;
    }
    setFile(asset);
    setPreview(asset.uri);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // Posts to the web API which validates + stores privately (authenticated).
      try {
        apiBase();
      } catch {
        setError(null);
        Alert.alert("Upload pending", "Photo saved on this phone. It will need to be uploaded once you're connected.");
        onUploaded?.(file.uri);
        return;
      }
      const data = await uploadEvidence({ assessmentId, itemId, uri: file.uri, fileName: file.fileName ?? "photo-" + Date.now() + ".jpg", mimeType: file.mimeType ?? "image/jpeg" });
      onUploaded?.(data.storageKey ?? file.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function requestAnalysis() {
    if (!file || !preview) return;
    setAnalysis("Analyzing…");
    try {
      try {
        apiBase();
      } catch {
        setAnalysis("AI photo analysis isn't available right now.");
        return;
      }
      // Convert to base64 via fetch blob
      const resp = await fetch(file.uri);
      const blob = await resp.blob();
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result);
          resolve(s.includes(",") ? s.split(",")[1] : s);
        };
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(blob);
      });
      const res = await apiFetch("/api/ai/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mimeType: file.mimeType ?? "image/jpeg", assessmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analysis failed");
      const d = data as { summary: string; limitations?: string[]; uncertainty?: string };
      setAnalysis([d.summary, d.limitations?.length ? `Limitations: ${d.limitations.join("; ")}` : "", d.uncertainty ? `Confidence: ${d.uncertainty}` : ""].filter(Boolean).join("\n"));
    } catch (e) {
      setAnalysis(`Analysis unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const clear = () => { setPreview(null); setFile(null); setError(null); setAnalysis(null); };

  return (
    <View style={{ gap: space.md }}>
      {preview ? (
        <View>
          <Image source={{ uri: preview }} style={{ width: "100%", height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }} resizeMode="cover" />
          <View style={{ position: "absolute", top: space.sm, right: space.sm }}>
            <IconButton icon="close" label="Remove photo" onPress={clear} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="Take photo" icon="camera" onPress={() => pick("camera")} style={{ flex: 1 }} />
          <Button title="Choose" icon="images-outline" variant="secondary" onPress={() => pick("library")} style={{ flex: 1 }} />
        </View>
      )}

      {preview ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title={uploading ? "Uploading…" : "Upload"} icon="cloud-upload-outline" variant="accent" onPress={upload} loading={uploading} style={{ flex: 1 }} />
          <Button title="Ask AI" icon="sparkles-outline" variant="secondary" onPress={requestAnalysis} style={{ flex: 1 }} />
        </View>
      ) : null}

      {error ? <Banner tone="danger" message={error} /> : null}
      {analysis ? <Banner tone="warning" title="AI suggestion — not a verified measurement" message={analysis} /> : null}
      <Text style={{ fontSize: 11, color: colors.textSubtle }}>Photos are stored privately and only shared with people in your workspace.</Text>
    </View>
  );
}
