import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { phoneCameraSource } from "./liveSource";
import type { LiveSourceHandle } from "../components/LiveSession";

/** The preview mounts only while a session runs, so the camera is off the rest of the time. */
function PhonePreview({ cameraRef, onReady, onError }: { cameraRef: RefObject<CameraView | null>; onReady: (ready: boolean) => void; onError: (message: string) => void }) {
  useEffect(() => () => onReady(false), [onReady]);
  return <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" animateShutter={false} mute onCameraReady={() => onReady(true)} onMountError={(e) => onError(e.message)} />;
}

/** The phone's back camera as a live frame source. */
export function usePhoneCamera(): LiveSourceHandle {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = useMemo(() => phoneCameraSource(() => cameraRef.current), []);
  const access: LiveSourceHandle["access"] = permission?.granted ? "granted" : permission && !permission.canAskAgain ? "blocked" : "ask";
  const onReady = useMemo(
    () => (isReady: boolean) => {
      setReady(isReady);
      if (isReady) setError(null);
    },
    [],
  );
  return {
    source,
    preview: <PhonePreview cameraRef={cameraRef} onReady={onReady} onError={setError} />,
    ready,
    access,
    requestAccess: () => {
      void requestPermission();
    },
    openSettings: () => {
      void Linking.openSettings();
    },
    error,
  };
}
