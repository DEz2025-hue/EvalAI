import { useState } from "react";
import { View, Text, Pressable, Image, ActivityIndicator, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { apiFetch, apiBase } from "../lib/api";

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
      Alert.alert("Permission needed", "Allow access in settings to capture/select photos. Photos are linked to the correct job/item and stored privately.");
      return;
    }
    const res =
      which === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: false });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (asset.mimeType && !ALLOWED.includes(asset.mimeType)) {
      setError(`Only JPEG/PNG/WebP allowed — got ${asset.mimeType}`);
      return;
    }
    if ((asset.fileSize ?? 0) > MAX_BYTES) {
      setError("Image too large (>15MB)");
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
        Alert.alert("Upload pending", "Photo captured locally — set EXPO_PUBLIC_APP_URL to your web to upload. Preview stored locally for now.");
        onUploaded?.(file.uri);
        return;
      }
      const fd = new FormData();
      // @ts-ignore — RN FormData blob
      fd.append("file", { uri: file.uri, name: file.fileName ?? `photo-${Date.now()}.jpg`, type: file.mimeType ?? "image/jpeg" } as unknown as Blob);
      fd.append("assessmentId", assessmentId);
      if (itemId) fd.append("itemId", itemId);
      const res = await apiFetch("/api/evidence/upload", { method: "POST", body: fd as never });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Upload failed");
      onUploaded?.((data as { storageKey?: string }).storageKey ?? file.uri);
      Alert.alert("Uploaded", (data as { persisted?: boolean }).persisted ? "Photo stored privately + evidence row linked." : "Photo validated — metadata staged (Supabase storage pending).");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function requestAnalysis() {
    if (!file || !preview) return;
    setAnalysis("Analyzing — suggestion only, not a verified measurement...");
    try {
      try {
        apiBase();
      } catch {
        setAnalysis("Analysis unavailable: set EXPO_PUBLIC_APP_URL to enable AI image analysis (server validates provider image support).");
        return;
      }
      // Convert to base64 via fetch blob — for demo, skip if too large
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
      setAnalysis(`${d.summary}\nLimitations: ${(d.limitations ?? []).join("; ")}\nUncertainty: ${d.uncertainty}`);
    } catch (e) {
      setAnalysis(`Analysis unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#fff", padding: 12, gap: 10 }}>
      <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Photo — linked to {itemId ? "checklist item" : "assessment"}</Text>
      <Text style={{ fontSize: 11, color: "#64748b" }}>Capture or pick, preview, then upload to . Ask AI only when you need it — result is suggestion with uncertainty.</Text>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable onPress={() => pick("camera")} style={{ flex: 1, minWidth: 120, backgroundColor: "#0f172a", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Capture Photo</Text>
        </Pressable>
        <Pressable onPress={() => pick("library")} style={{ flex: 1, minWidth: 120, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}>
          <Text style={{ fontWeight: "700", fontSize: 12, color: "#0f172a" }}>Pick from Library</Text>
        </Pressable>
      </View>

      {preview ? <Image source={{ uri: preview }} style={{ width: "100%", height: 180, borderRadius: 10, backgroundColor: "#f1f5f9" }} resizeMode="cover" /> : null}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable onPress={upload} disabled={!preview || uploading} style={{ backgroundColor: !preview || uploading ? "#94a3b8" : "#16a34a", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          {uploading ? <ActivityIndicator color="#fff" size="small" /> : null}
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{uploading ? "Uploading…" : "Upload photo"}</Text>
        </Pressable>
        <Pressable onPress={requestAnalysis} disabled={!preview} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 }}>
          <Text style={{ fontWeight: "700", fontSize: 12, color: "#0f172a" }}>Request AI analysis</Text>
        </Pressable>
        <Pressable onPress={() => { setPreview(null); setFile(null); setError(null); setAnalysis(null); }} style={{ paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ fontSize: 12, color: "#64748b" }}>Remove preview</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 11, color: "#64748b" }}>Private by default — short-lived signed URL only after authorization. AI visual output is a suggestion; never treat as verified dimension.</Text>

      {error ? <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#dc2626" }}>{error}</Text></View> : null}
      {analysis ? <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#78350f" }}>{analysis}</Text></View> : null}
    </View>
  );
}
