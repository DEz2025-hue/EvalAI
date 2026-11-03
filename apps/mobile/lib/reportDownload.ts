import { Alert, Linking } from "react-native";
import { apiFetch } from "./api";

/** Make the PDF of a report version and open it. Callers check the preview gate first (see reportPreviewState.ts). */
export async function downloadReportPdf(snapshotId: string): Promise<void> {
  const res = await apiFetch("/api/reports/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId }) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; signedUrl?: string | null };
  if (!res.ok) throw new Error(data.error ?? "Could not create the PDF");
  if (data.signedUrl) await Linking.openURL(data.signedUrl);
  else Alert.alert("PDF ready", "The PDF was created, but it can't be downloaded on this device right now. Open this report on the web to download it.");
}
