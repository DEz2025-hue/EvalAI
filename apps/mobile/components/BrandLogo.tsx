import { Image, type ImageStyle, type StyleProp } from "react-native";
import { colors } from "../lib/theme";

// Both images are drawn in black on a transparent background; tintColor repaints them in the current scheme's text colour.
const LOCKUP = require("../assets/logo.png");
const MARK = require("../assets/logo-mark.png");

/** Width-to-height ratio of each image, so callers only pass a height. */
const RATIO = { lockup: 600 / 800, mark: 1 } as const;

/**
 * The EvalAI logo. "lockup" is the e mark with the EvalAI wordmark under it (sign-in, splash-like moments); "mark" is the e on its
 * own, for tight spots. It follows light and dark mode unless a colour is passed.
 */
export function BrandLogo({
  variant = "mark",
  height = 40,
  color = colors.text,
  style,
}: {
  variant?: "lockup" | "mark";
  height?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={variant === "lockup" ? LOCKUP : MARK}
      style={[{ height, width: height * RATIO[variant], tintColor: color }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="EvalAI"
    />
  );
}
