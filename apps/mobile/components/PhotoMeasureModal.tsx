import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Image, Modal, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { PHOTO_REFERENCES, boxFromCorners, checkPhotoCapture, checkReference, type PhotoCapture, type PhotoReferenceId, type PixelBox, type PixelPoint } from "@eval-ai/shared";
import { apiFetch } from "../lib/api";
import { colors, radius, space } from "../lib/theme";
import { Banner, Button, Card, Chip, IconButton, Select, Text } from "./ui";

export type PhotoMeasureResult = { valueM: number; capture: PhotoCapture };

type Img = { uri: string; w: number; h: number; base64: string };
type Candidate = { box: PixelBox; confidence: number | null };
type AiState = { kind: "idle" } | { kind: "loading" } | { kind: "done" } | { kind: "note"; message: string };

const MAX_SIDE = 1600;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const area = (b: PixelBox) => (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1);

/** The photo at a size that fits the screen, with overlays drawn in photo pixels and taps converted back to photo pixels. */
function PhotoCanvas({ img, maxW, maxH, onTap, children }: { img: Img; maxW: number; maxH: number; onTap: (p: PixelPoint) => void; children: (k: number) => ReactNode }) {
  const fitW = Math.min(maxW, (maxH * img.w) / img.h);
  const k = fitW / img.w;
  const fitH = img.h * k;
  return (
    <View style={{ alignItems: "center" }}>
      {/* The responder system reports the touch position (locationX/Y) on phones and on web; a Pressable's press event does not on web. */}
      <View
        aria-label="Photo. Tap to place a point."
        onStartShouldSetResponder={() => true}
        onResponderRelease={(e) => {
          const { locationX, locationY } = e.nativeEvent;
          if (Number.isFinite(locationX) && Number.isFinite(locationY)) onTap({ x: clamp(locationX / k, 0, img.w - 1), y: clamp(locationY / k, 0, img.h - 1) });
        }}
        style={{ width: fitW, height: fitH, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, overflow: "hidden" }}
      >
        <View style={{ width: fitW, height: fitH, pointerEvents: "none" }}>
          <Image source={{ uri: img.uri }} style={{ width: fitW, height: fitH }} resizeMode="stretch" />
          {children(k)}
        </View>
      </View>
    </View>
  );
}

function Rect({ box, k, color, label, dashed }: { box: PixelBox; k: number; color: string; label?: string; dashed?: boolean }) {
  return (
    <View style={{ position: "absolute", left: box.x1 * k, top: box.y1 * k, width: (box.x2 - box.x1 + 1) * k, height: (box.y2 - box.y1 + 1) * k, borderWidth: 2, borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}>
      {label ? (
        <View style={{ position: "absolute", left: -2, top: -2, backgroundColor: color, paddingHorizontal: 6, paddingVertical: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textOnDark }}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Dot({ p, k, color }: { p: PixelPoint; k: number; color: string }) {
  return <View style={{ position: "absolute", left: p.x * k - 8, top: p.y * k - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: color, borderWidth: 2, borderColor: colors.surface }} />;
}

function Line({ a, b, k, color }: { a: PixelPoint; b: PixelPoint; k: number; color: string }) {
  const dx = (b.x - a.x) * k;
  const dy = (b.y - a.y) * k;
  const len = Math.hypot(dx, dy);
  return <View style={{ position: "absolute", left: ((a.x + b.x) * k) / 2 - len / 2, top: ((a.y + b.y) * k) / 2 - 1.5, width: len, height: 3, backgroundColor: color, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
}

/**
 * Estimate a length from a photo. A flat object of known size (paper or a card) in the same plane gives the scale;
 * the person taps both ends of what they want to measure. The AI only proposes the reference's outline, and the person
 * confirms it. Every result is labelled an estimate, and the server re-checks the same rules before saving.
 */
export function PhotoMeasureModal({ visible, title = "Measure from a photo", assessmentId, onClose, onUse }: { visible: boolean; title?: string; assessmentId?: string; onClose: () => void; onUse: (r: PhotoMeasureResult) => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [referenceId, setReferenceId] = useState<PhotoReferenceId>("a4");
  const [img, setImg] = useState<Img | null>(null);
  const [step, setStep] = useState<"reference" | "measure">("reference");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<AiState>({ kind: "idle" });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [manualRef, setManualRef] = useState(false);
  const [corners, setCorners] = useState<PixelPoint[]>([]);
  const [refBox, setRefBox] = useState<PixelBox | null>(null);
  const [method, setMethod] = useState<"sam" | "manual">("manual");
  const [confidence, setConfidence] = useState<number | undefined>(undefined);
  const [points, setPoints] = useState<PixelPoint[]>([]);

  const ref = PHOTO_REFERENCES[referenceId];
  const refName = ref.label.split(" (")[0];

  function clearReference() {
    setAi({ kind: "idle" });
    setCandidates([]);
    setSelected(null);
    setManualRef(false);
    setCorners([]);
    setRefBox(null);
    setConfidence(undefined);
    setPoints([]);
    setStep("reference");
  }

  useEffect(() => {
    if (!visible) return;
    setReferenceId("a4");
    setImg(null);
    clearReference();
  }, [visible]);

  async function pick(which: "camera" | "library") {
    const perm = which === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "Allow camera or photo access in Settings to measure from a photo.");
      return;
    }
    const res =
      which === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, allowsEditing: false });
    if (res.canceled) return;
    setBusy(true);
    try {
      // Re-encode so the picture is upright, a sensible size, and identical to what is shown and sent to the AI.
      const rendered = await ImageManipulator.manipulate(res.assets[0].uri, { maxWidth: MAX_SIDE, maxHeight: MAX_SIDE }).renderAsync();
      const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
      if (!out.base64) throw new Error("The photo couldn't be prepared.");
      clearReference();
      setImg({ uri: out.uri, w: out.width, h: out.height, base64: out.base64 });
    } catch (e) {
      Alert.alert("Couldn't use that photo", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function selectCandidate(i: number) {
    const c = candidates[i];
    if (!c) return;
    setSelected(i);
    setRefBox(c.box);
    setMethod("sam");
    setConfidence(c.confidence ?? undefined);
  }

  async function findWithAi() {
    if (!img) return;
    setManualRef(false);
    setCorners([]);
    setAi({ kind: "loading" });
    try {
      const res = await apiFetch("/api/ai/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: img.base64, mimeType: "image/jpeg", assessmentId, reference: referenceId }),
      });
      const data = (await res.json().catch(() => ({}))) as { boxes?: Array<{ x1: number; y1: number; x2: number; y2: number; w: number; h: number; confidence: number | null }>; error?: string };
      if (!res.ok) {
        setAi({ kind: "note", message: (data.error ?? "The AI isn't available right now.") + " Mark the corners yourself instead." });
        return;
      }
      const all = data.boxes ?? [];
      if (all.length === 0) {
        setAi({ kind: "note", message: `The AI didn't find a ${refName} in this photo. Mark its corners yourself, or retake the photo with it flat and fully visible.` });
        return;
      }
      // Outlines are only trustworthy when the AI saw the same pixels we show; otherwise ignore them.
      const same = all.filter((b) => b.w === img.w && b.h === img.h);
      if (same.length === 0) {
        setAi({ kind: "note", message: "The AI saw the photo differently from how it's shown here, so its outline can't be trusted. Mark the corners yourself." });
        return;
      }
      const list = same.map((b) => ({ box: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 }, confidence: b.confidence }));
      setCandidates(list);
      setAi({ kind: "done" });
      setSelected(0);
      setRefBox(list[0].box);
      setMethod("sam");
      setConfidence(list[0].confidence ?? undefined);
    } catch (e) {
      setAi({ kind: "note", message: (e instanceof Error ? e.message : String(e)) + " Mark the corners yourself instead." });
    }
  }

  function onTap(p: PixelPoint) {
    if (step === "measure") {
      setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
      return;
    }
    if (manualRef) {
      const next = corners.length >= 2 ? [p] : [...corners, p];
      setCorners(next);
      setSelected(null);
      if (next.length === 2) {
        setRefBox(boxFromCorners(next[0], next[1]));
        setMethod("manual");
        setConfidence(undefined);
      } else {
        setRefBox(null);
      }
      return;
    }
    const hits = candidates.map((c, i) => ({ c, i })).filter(({ c }) => p.x >= c.box.x1 && p.x <= c.box.x2 && p.y >= c.box.y1 && p.y <= c.box.y2);
    hits.sort((a, b) => area(a.c.box) - area(b.c.box));
    if (hits[0]) selectCandidate(hits[0].i);
  }

  const refCheck = useMemo(() => (img && refBox ? checkReference({ reference: referenceId, method, imageW: img.w, imageH: img.h, refBox, confidence }) : null), [img, refBox, referenceId, method, confidence]);
  const capture: PhotoCapture | null = img && refBox && points.length === 2 ? { reference: referenceId, method, imageW: img.w, imageH: img.h, refBox, confidence, from: points[0], to: points[1] } : null;
  const result = capture ? checkPhotoCapture(capture) : null;
  const maxW = width - space.lg * 2;
  const maxH = height * 0.5;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ backgroundColor: colors.brand, paddingTop: Math.max(insets.top, space.lg), paddingBottom: space.md, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text variant="heading" color={colors.textOnDark} style={{ flex: 1 }}>{title}</Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          <Banner tone="warning" title="Photo estimate" message="This is an estimate from a photo, not a verified measurement. Check it against a tape when accuracy matters." />

          <Select
            label="Reference object"
            title="Reference object"
            value={referenceId}
            options={Object.values(PHOTO_REFERENCES).map((r) => ({ value: r.id, label: r.label, description: r.hint, icon: r.id === "card" ? "card-outline" : "document-outline" }))}
            onChange={(v) => {
              setReferenceId(v as PhotoReferenceId);
              clearReference();
            }}
          />

          {!img ? (
            <>
              <Card>
                <Text variant="heading">How to take the photo</Text>
                <Text variant="caption">1. Lay the {refName} flat, on the same surface as what you're measuring.</Text>
                <Text variant="caption">2. Hold the camera straight on, not at an angle.</Text>
                <Text variant="caption">3. Keep the whole {refName} and both ends of what you're measuring in the photo.</Text>
                <Text variant="caption">4. Get close: the {refName} should fill a good part of the picture.</Text>
              </Card>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button title="Take photo" icon="camera" onPress={() => pick("camera")} loading={busy} style={{ flex: 1 }} />
                <Button title="Choose" icon="images-outline" variant="secondary" onPress={() => pick("library")} disabled={busy} style={{ flex: 1 }} />
              </View>
            </>
          ) : step === "reference" ? (
            <>
              <Text variant="heading">1 · Show where the {refName} is</Text>
              <PhotoCanvas img={img} maxW={maxW} maxH={maxH} onTap={onTap}>
                {(k) => (
                  <>
                    {candidates.map((c, i) => (i === selected ? null : <Rect key={i} box={c.box} k={k} color={colors.accent} label={String(i + 1)} dashed />))}
                    {refBox ? <Rect box={refBox} k={k} color={colors.success} label={selected !== null ? String(selected + 1) : undefined} /> : null}
                    {corners.map((p, i) => <Dot key={i} p={p} k={k} color={colors.success} />)}
                  </>
                )}
              </PhotoCanvas>

              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button title={ai.kind === "loading" ? "Looking…" : candidates.length ? "Look again" : "Find it with AI"} icon="sparkles" variant="accent" size="sm" onPress={findWithAi} loading={ai.kind === "loading"} style={{ flex: 1 }} />
                <Button
                  title={manualRef ? "Pick from AI results" : "Mark corners myself"}
                  icon="scan-outline"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setManualRef((m) => !m);
                    setCorners([]);
                    setSelected(null);
                    setRefBox(null);
                    setConfidence(undefined);
                  }}
                  style={{ flex: 1 }}
                />
              </View>

              {ai.kind === "note" ? <Banner tone="neutral" message={ai.message} /> : null}
              {manualRef ? <Text variant="caption">Tap one corner of the {refName}, then the opposite corner.</Text> : null}
              {!manualRef && candidates.length > 1 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {candidates.map((c, i) => (
                    <Chip key={i} label={`Match ${i + 1}${c.confidence !== null ? ` · ${Math.round(c.confidence * 100)}%` : ""}`} tone="accent" active={selected === i} onPress={() => selectCandidate(i)} />
                  ))}
                </View>
              ) : null}
              {!manualRef && candidates.length === 1 ? <Text variant="caption">The AI found one match{candidates[0].confidence !== null ? ` (${Math.round(candidates[0].confidence * 100)}% sure)` : ""}. Check that the green box fits the {refName}.</Text> : null}

              {refCheck ? (
                "reason" in refCheck ? (
                  <Banner tone="danger" message={refCheck.reason} />
                ) : (
                  <Banner tone="success" title={`The ${refName} looks flat and straight`} message={`Scale about ${refCheck.mmPerPx.toFixed(3)} mm per pixel; its sides agree within ${(refCheck.ratioError * 100).toFixed(1)}%.`} />
                )
              ) : null}

              <Button title="Continue" icon="arrow-forward" variant="accent" onPress={() => { setPoints([]); setStep("measure"); }} disabled={!refCheck || "reason" in refCheck} />
              <Button title="Choose a different photo" variant="ghost" size="sm" onPress={() => { setImg(null); clearReference(); }} />
            </>
          ) : (
            <>
              <Text variant="heading">2 · Tap both ends of what you want to measure</Text>
              <PhotoCanvas img={img} maxW={maxW} maxH={maxH} onTap={onTap}>
                {(k) => (
                  <>
                    {refBox ? <Rect box={refBox} k={k} color={colors.success} /> : null}
                    {points.length === 2 ? <Line a={points[0]} b={points[1]} k={k} color={colors.danger} /> : null}
                    {points.map((p, i) => <Dot key={i} p={p} k={k} color={colors.danger} />)}
                  </>
                )}
              </PhotoCanvas>

              {result && !("reason" in result) ? (
                <Card style={{ alignItems: "center", gap: 2 }}>
                  <Text variant="caption">About</Text>
                  <Text variant="display">{(result.lengthMm / 1000).toFixed(3)} m</Text>
                  <Text variant="caption">{(result.lengthMm / 10).toFixed(1)} cm, scaled from the {refName}</Text>
                </Card>
              ) : result ? (
                <Banner tone="danger" message={result.reason} />
              ) : (
                <Text variant="caption">{points.length === 0 ? "Tap the first end." : "Now tap the other end."} Stay on the same surface as the {refName}.</Text>
              )}

              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button title="Redo points" icon="refresh" variant="secondary" onPress={() => setPoints([])} disabled={points.length === 0} style={{ flex: 1 }} />
                <Button
                  title="Use this length"
                  icon="checkmark"
                  variant="accent"
                  disabled={!capture || !result || "reason" in result}
                  onPress={() => {
                    if (capture && result && !("reason" in result)) onUse({ valueM: result.lengthMm / 1000, capture });
                  }}
                  style={{ flex: 1 }}
                />
              </View>
              <Button title="Change the reference" variant="ghost" size="sm" onPress={() => setStep("reference")} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
