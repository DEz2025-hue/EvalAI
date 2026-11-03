import { useCallback, useEffect, useRef, useState } from "react";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";

/** One finished piece of narration: a local audio file and the time it covers. */
export type NarrationPiece = { uri: string; startedAt: number; endedAt: number };

/**
 * The microphone side of a live session (decision D-017). Audio is recorded in short pieces: rotate() closes the current
 * piece and starts the next, stop() closes the last one and turns the microphone off. This is the ONLY place in the live
 * session that touches the microphone, so the privacy rules can be checked in one file.
 *
 * Known limit: the recorder restarts at each boundary, so a fraction of a second of speech can fall between two pieces.
 */
export type NarrationHandle = {
  /** True while the microphone is recording. */
  active: boolean;
  /** "granted", "ask" (can still ask), "blocked" (the person must use Settings) or "unsupported". */
  access: "granted" | "ask" | "blocked" | "unsupported";
  error: string | null;
  start(): Promise<boolean>;
  rotate(): Promise<NarrationPiece | null>;
  stop(): Promise<NarrationPiece | null>;
};

export function useNarration(): NarrationHandle {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [active, setActive] = useState(false);
  const [access, setAccess] = useState<NarrationHandle["access"]>("ask");
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const activeRef = useRef(false);

  const begin = useCallback(async () => {
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedAt.current = Date.now();
  }, [recorder]);

  const close = useCallback(async (): Promise<NarrationPiece | null> => {
    const from = startedAt.current;
    try {
      await recorder.stop();
    } catch {
      return null;
    }
    const uri = recorder.uri;
    return uri ? { uri, startedAt: from, endedAt: Date.now() } : null;
  }, [recorder]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== "granted") {
        setAccess(status === "denied" ? "blocked" : "ask");
        setError(status === "denied" ? "Microphone access is off — turn it on in Settings to narrate. The session works without it." : "Allow the microphone to narrate.");
        return false;
      }
      setAccess("granted");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await begin();
      activeRef.current = true;
      setActive(true);
      return true;
    } catch (e) {
      setAccess("unsupported");
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [begin]);

  const rotate = useCallback(async () => {
    if (!activeRef.current) return null;
    const piece = await close();
    try {
      await begin();
    } catch (e) {
      activeRef.current = false;
      setActive(false);
      setError(e instanceof Error ? e.message : String(e));
    }
    return piece;
  }, [begin, close]);

  const stop = useCallback(async () => {
    if (!activeRef.current) return null;
    activeRef.current = false;
    setActive(false);
    const piece = await close();
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      /* the microphone is already stopped */
    }
    return piece;
  }, [close]);

  // Leaving the screen turns the microphone off. (The recorder itself is released by useAudioRecorder.)
  useEffect(
    () => () => {
      if (activeRef.current) void recorder.stop().catch(() => {});
      activeRef.current = false;
    },
    [recorder],
  );

  return { active, access, error, start, rotate, stop };
}
