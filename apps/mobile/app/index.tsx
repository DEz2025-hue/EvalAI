import { Text, View, Pressable, ScrollView, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";

export default function MobileHome() {
  const [status, setStatus] = useState<string>("");

  async function pickPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Camera permission needed", "Allow camera in settings or pick from library. Photos are linked to the correct assessment/item and stored privately.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) {
      setStatus(`Photo captured: ${res.assets[0].uri} — private upload pending Supabase env (see web PhotoCapture for server validation)`);
    }
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) setStatus(`From library: ${res.assets[0].uri}`);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>EvalAI — Mobile</Text>
      <Text style={{ color: "#475569", fontSize: 13 }}>Field capture: photos, voice notes, checklist — same Supabase RLS & private evidence as web.</Text>

      <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, backgroundColor: "#fff" }}>
        <Text style={{ fontWeight: "600" }}>Photo — visible controls, permission handling</Text>
        <Text style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Camera permission asked only when you tap Capture. Images validated (jpeg/png/webp, ≤20MB, magic bytes) server-side; stored private, signed URL only after authorization. AI analysis is user-requested suggestion only.</Text>
        <Pressable onPress={pickPhoto} style={{ marginTop: 10, backgroundColor: "#16a34a", padding: 12, borderRadius: 8, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "600" }}>Capture Photo</Text></Pressable>
        <Pressable onPress={pickFromLibrary} style={{ marginTop: 8, borderWidth: 1, borderColor: "#e2e8f0", padding: 12, borderRadius: 8, alignItems: "center" }}><Text>Pick from Library</Text></Pressable>
        {status ? <Text style={{ marginTop: 8, fontSize: 12 }}>{status}</Text> : null}
      </View>

      <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, backgroundColor: "#fff" }}>
        <Text style={{ fontWeight: "600" }}>Voice — mic permission & fallback</Text>
        <Text style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Microphone: permission asked only on Record, visible recording state + stop/cancel, original audio preserved where supported. Transcript editable, unconfirmed until you confirm. If denied or unsupported, type in the assessment notes instead — manual fallback always available.</Text>
        <Text style={{ fontSize: 12, color: "#92400e", marginTop: 8, backgroundColor: "#fef3c7", padding: 8, borderRadius: 8 }}>Expo Audio recording: integrate expo-audio `requestPermissionsAsync` + `createRecording` — same server route POST /api/voice/upload + POST /api/ai/transcribe as web. Text fallback shown when unavailable.</Text>
      </View>

      <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, backgroundColor: "#fef3c7" }}>
        <Text style={{ fontSize: 12 }}>Coming Soon: continuous live-camera AI guidance — not a working feature until provider validated.</Text>
      </View>
    </ScrollView>
  );
}
