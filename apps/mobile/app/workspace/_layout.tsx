import { Stack } from "expo-router";

export default function WorkspaceLayout() {
  return <Stack screenOptions={{ headerShown: true, headerStyle: { backgroundColor: "#0f172a" }, headerTintColor: "#fff", headerTitleStyle: { fontWeight: "700" } }} />;
}
