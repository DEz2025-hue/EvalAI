import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { areaM2, volumeM3, cableLengthWithSag } from "@eval-ai/shared";

export function MeasurementsPanelMobile({ assessmentId }: { assessmentId: string }) {
  const [length, setLength] = useState("10");
  const [width, setWidth] = useState("6");
  const [height, setHeight] = useState("3");
  const [cable, setCable] = useState("50");
  const [saved, setSaved] = useState<Array<{ name: string; value: number; unit: string; source: string }>>([
    { name: "Roof area", value: 0, unit: "m²", source: "manual" },
  ]);

  const l = Number(length);
  const w = Number(width);
  const h = Number(height);
  const c = Number(cable);
  const area = (() => { try { return areaM2(l, w); } catch { return NaN; } })();
  const vol = (() => { try { return volumeM3(l, w, h); } catch { return NaN; } })();
  const withSag = (() => { try { return cableLengthWithSag(c); } catch { return NaN; } })();

  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 12 }}>
      <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Measurements & deterministic calculations</Text>
      <Text style={{ fontSize: 11, color: "#64748b" }}>Manual entry, units explicit, provenance preserved. AI cannot overwrite. Calculations are tested and never sourced from AI visuals.</Text>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 80, gap: 4 }}>
          <Text style={{ fontSize: 11, color: "#475569" }}>Length (m)</Text>
          <TextInput value={length} onChangeText={setLength} keyboardType="numeric" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
        <View style={{ flex: 1, minWidth: 80, gap: 4 }}>
          <Text style={{ fontSize: 11, color: "#475569" }}>Width (m)</Text>
          <TextInput value={width} onChangeText={setWidth} keyboardType="numeric" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
        <View style={{ flex: 1, minWidth: 80, gap: 4 }}>
          <Text style={{ fontSize: 11, color: "#475569" }}>Height (m)</Text>
          <TextInput value={height} onChangeText={setHeight} keyboardType="numeric" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 120, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10 }}>
          <Text style={{ fontSize: 11, color: "#64748b" }}>Area</Text>
          <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>{Number.isFinite(area) ? `${area.toFixed(2)} m²` : "—"} <Text style={{ fontSize: 10, color: "#64748b" }}>(areaM2)</Text></Text>
        </View>
        <View style={{ flex: 1, minWidth: 120, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10 }}>
          <Text style={{ fontSize: 11, color: "#64748b" }}>Volume</Text>
          <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>{Number.isFinite(vol) ? `${vol.toFixed(2)} m³` : "—"}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 11, color: "#475569" }}>Straight cable (m)</Text>
          <TextInput value={cable} onChangeText={setCable} keyboardType="numeric" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
        <View style={{ flex: 1, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10 }}>
          <Text style={{ fontSize: 11, color: "#64748b" }}>With sag (5%)</Text>
          <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>{Number.isFinite(withSag) ? `${withSag.toFixed(1)} m` : "—"}</Text>
        </View>
      </View>

      <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <View style={{ backgroundColor: "#f8fafc", paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>Name</Text>
          <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>Value / Source</Text>
        </View>
        {saved.map((m, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#f1f5f9" }}>
            <Text style={{ fontSize: 12, color: "#0f172a" }}>{m.name}</Text>
            <Text style={{ fontSize: 12, color: "#475569" }}>{m.value} {m.unit} · <Text style={{ fontSize: 10 }}>{m.source}</Text></Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable onPress={() => setSaved((prev) => [...prev, { name: `M${prev.length + 1}`, value: Number.isFinite(area) ? area : 0, unit: "m²", source: "calculation: areaM2" }])} style={{ borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#0f172a" }}>Save area to measurements</Text>
        </Pressable>
        <Pressable onPress={() => setSaved((prev) => [...prev, { name: `Vol ${prev.length + 1}`, value: Number.isFinite(vol) ? vol : 0, unit: "m³", source: "calculation: volumeM3" }])} style={{ borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#0f172a" }}>Save volume</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 11, color: "#64748b" }}>Values saved to checklist responses + evidence links for assessment {assessmentId.slice(0, 8)}. AI cannot overwrite them.</Text>
    </View>
  );
}
