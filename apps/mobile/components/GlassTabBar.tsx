import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Tabs } from "expo-router";
import { colors, glass, space } from "../lib/theme";
import { GlassSurface } from "./glass";
import { Text } from "./ui";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const BAR_HEIGHT = 62;
const SIDE_MARGIN = 16;
const BOTTOM_GAP = 8;

/** How much room the floating bar takes at the bottom of a screen, so content can scroll clear of it. */
export function tabBarInset(bottomSafeArea: number): number {
  return BAR_HEIGHT + Math.max(bottomSafeArea, 10) + BOTTOM_GAP + space.sm;
}

/** The tab bar: a floating Liquid Glass capsule with the active tab picked out by a soft pill. */
export function GlassTabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: SIDE_MARGIN, right: SIDE_MARGIN, bottom: Math.max(insets.bottom, 10) + BOTTOM_GAP - 8 }}>
      <GlassSurface cornerRadius={BAR_HEIGHT / 2} elevated style={{ height: BAR_HEIGHT, flexDirection: "row", alignItems: "center", paddingHorizontal: 6 }}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          if ((options as { href?: string | null }).href === null) return null;
          const focused = state.index === index;
          const color = focused ? colors.text : colors.textMuted;
          const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : options.title ?? route.name;
          const onPress = () => {
            const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
              style={{ flex: 1, height: BAR_HEIGHT - 14, borderRadius: (BAR_HEIGHT - 14) / 2, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: focused ? glass.edge : "transparent" }}
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <Text style={{ fontSize: 10.5, fontWeight: focused ? "700" : "600", color }} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}
