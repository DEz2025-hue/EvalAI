import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Dimensions, Keyboard, Platform, ScrollView, TextInput, type KeyboardEvent, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";

/** Space kept between the focused field and the top of the keyboard. */
const GAP = 24;

type Reveal = () => void;
const RevealContext = createContext<Reveal | null>(null);

/** Inputs call this on focus so the nearest KeyboardScroll brings them above the keyboard. */
export function useKeyboardReveal(): Reveal {
  return useContext(RevealContext) ?? noop;
}
function noop() {}

/**
 * ScrollView that keeps the focused input visible above the keyboard, on iOS and Android.
 * Android apps now draw edge-to-edge, so the window no longer shrinks for the keyboard; instead this pads
 * the content by the keyboard height and scrolls the focused field into view. Plain JS — works in Expo Go.
 */
export function KeyboardScroll({ children, contentContainerStyle, ...rest }: ScrollViewProps & { children: ReactNode; contentContainerStyle?: StyleProp<ViewStyle> }) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const reveal = useCallback(() => {
    const top = keyboardTop.current;
    const input = TextInput.State.currentlyFocusedInput();
    if (top === null || !input) return;
    // Wait a frame so the added padding is laid out before measuring.
    requestAnimationFrame(() => {
      input.measureInWindow((_x, y, _w, h) => {
        const overlap = y + h + GAP - top;
        if (overlap > 0) scrollRef.current?.scrollTo({ y: offset.current + overlap, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      const height = e.endCoordinates.height;
      keyboardTop.current = e.endCoordinates.screenY > 0 ? e.endCoordinates.screenY : Dimensions.get("window").height - height;
      setKeyboardHeight(height);
      setTimeout(reveal, Platform.OS === "ios" ? 0 : 50);
    };
    const onHide = () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
    };
    // iOS reports the keyboard before it animates in; Android only after it is shown.
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", onShow);
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  // When the keyboard is already open and focus moves to another field, scroll to the new one.
  const revealSoon = useCallback(() => {
    if (keyboardTop.current !== null) setTimeout(reveal, 0);
  }, [reveal]);
  const ctx = useMemo(() => revealSoon, [revealSoon]);

  return (
    <RevealContext.Provider value={ctx}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        scrollEventThrottle={16}
        {...rest}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
          rest.onScroll?.(e);
        }}
        contentContainerStyle={[contentContainerStyle, keyboardHeight ? { paddingBottom: keyboardHeight + GAP } : null]}
      >
        {children}
      </ScrollView>
    </RevealContext.Provider>
  );
}
