import * as Speech from "expo-speech";

// Reads a question aloud with the phone's own speech engine (no provider text-to-speech exists, AI_AND_VOICE.md). Always optional:
// every question is also shown as text, and a failure to speak is silent.

export function speak(text: string): void {
  try {
    Speech.stop();
    Speech.speak(text, { rate: 0.95 });
  } catch {
    /* the question is on screen anyway */
  }
}

export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {
    /* nothing to stop */
  }
}
