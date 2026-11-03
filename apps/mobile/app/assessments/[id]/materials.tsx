import { useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { MaterialsListMobile } from "../../../components/MaterialsListMobile";
import { QuotationReviewMobile } from "../../../components/QuotationReviewMobile";
import { Banner, Screen, Text } from "../../../components/ui";

export default function MobileMaterials() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assessmentId = String(id);
  // The real latest saved version (the list reports it when it loads and after each save), never a hard-coded 1.
  const [version, setVersion] = useState(0);
  return (
    <Screen>
      <Stack.Screen options={{ title: "Materials & quotes" }} />
      <Text variant="caption">Each material links to the measurement or finding behind it. Quantities stay provisional until the inputs are confirmed.</Text>
      <MaterialsListMobile assessmentId={assessmentId} version={version} onVersion={setVersion} />
      <QuotationReviewMobile key={version} assessmentId={assessmentId} materialsVersion={version} />
      <Banner tone="neutral" message="Prices only ever come from real quotations. Changing materials marks older quotes as out of date." />
    </Screen>
  );
}
