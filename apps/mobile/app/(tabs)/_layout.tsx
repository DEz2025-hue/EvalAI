import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabIcon({ label }: { label: string }) {
  return <Text style={{ fontSize: 16 }}>{label}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: "#0ea5e9",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#e2e8f0" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerTitle: "EvalAI",
          tabBarIcon: () => <TabIcon label="⌂" />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          headerTitle: "Jobs",
          tabBarIcon: () => <TabIcon label="▦" />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          headerTitle: "Create",
          tabBarIcon: () => <TabIcon label="＋" />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          headerTitle: "Reports",
          tabBarIcon: () => <TabIcon label="▤" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          headerTitle: "Profile",
          tabBarIcon: () => <TabIcon label="◉" />,
        }}
      />
    </Tabs>
  );
}
