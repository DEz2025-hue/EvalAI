import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, headerOptions } from "../../lib/theme";
import { GlassSurface } from "../../components/glass";
import { GlassTabBar, tabBarInset } from "../../components/GlassTabBar";
import { TabBarInsetContext } from "../../components/ui";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Filled icon when the tab is active, outline otherwise. */
function tabIcon(name: string) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={size} color={color as string} />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <TabBarInsetContext.Provider value={tabBarInset(insets.bottom)}>
      <Tabs
        tabBar={(props) => <GlassTabBar {...props} />}
        screenOptions={{
          ...headerOptions,
          // The header is frosted glass too: a blurred, nearly opaque bar with a hairline edge.
          headerBackground: () => <GlassSurface edge="bottom" cornerRadius={0} style={StyleSheet.absoluteFill} />,
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textMuted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home", headerTitle: "EvalAI", tabBarIcon: tabIcon("home") }} />
        <Tabs.Screen name="jobs" options={{ title: "Jobs", tabBarIcon: tabIcon("briefcase") }} />
        <Tabs.Screen name="create" options={{ title: "New job", tabBarIcon: tabIcon("add-circle") }} />
        <Tabs.Screen name="reports" options={{ title: "Reports", tabBarIcon: tabIcon("document-text") }} />
        <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabIcon("person-circle") }} />
      </Tabs>
    </TabBarInsetContext.Provider>
  );
}
