import { Stack } from "expo-router";
import { headerOptions } from "../../lib/theme";

export default function JobLayout() {
  return <Stack screenOptions={{ headerShown: true, ...headerOptions }} />;
}
