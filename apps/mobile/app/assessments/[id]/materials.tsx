import { ScrollView, View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { MaterialsListMobile } from "../../../components/MaterialsListMobile";
import { QuotationReviewMobile } from "../../../components/QuotationReviewMobile";

export default function MobileMaterials() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assessmentId = String(id);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>Materials & quotations</Text>
        <Text style={{ fontSize: 12, color: "#64748b" }}>{assessmentId.slice(0, 8)} · traceable to measurements/findings/rules; quantities provisional if inputs missing. Quotes tied to exact materials version — stale when materials change.</Text>
      </View>
      <MaterialsListMobile assessmentId={assessmentId} version={1} />
      <QuotationReviewMobile assessmentId={assessmentId} materialsVersion={1} />
      <View style={{ backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 10 }}>
        <Text style={{ fontSize: 11, color: "#475569" }}>Prices never invented — only from quotations. Changing materials increments version and marks prior quotations stale (trigger <Text style={{ fontWeight: "600" }}>mark_quotations_stale</Text>).</Text>
      </View>
    </ScrollView>
  );
}
