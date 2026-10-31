import { Stack, useLocalSearchParams } from "expo-router";
import { MaterialsListMobile } from "../../../components/MaterialsListMobile";
import { QuotationReviewMobile } from "../../../components/QuotationReviewMobile";
import { Banner, Screen, Text } from "../../../components/ui";

export default function MobileMaterials() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assessmentId = String(id);
  return (
    <Screen>
      <Stack.Screen options={{ title: "Materials & quotes" }} />
      <Text variant="caption">Each material links to the measurement or finding behind it. Quantities stay provisional until the inputs are confirmed.</Text>
      <MaterialsListMobile assessmentId={assessmentId} version={1} />
      <QuotationReviewMobile assessmentId={assessmentId} materialsVersion={1} />
      <Banner tone="neutral" message="Prices only ever come from real quotations. Changing materials marks older quotes as out of date." />
    </Screen>
  );
}
