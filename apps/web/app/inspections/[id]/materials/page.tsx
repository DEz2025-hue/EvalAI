import { MaterialsWorkspace } from "../../../../components/MaterialsWorkspace";

export default function InspectionMaterialsPage({ params }: { params: { id: string } }): JSX.Element {
  return <MaterialsWorkspace id={params.id} basePath="/inspections" />;
}
