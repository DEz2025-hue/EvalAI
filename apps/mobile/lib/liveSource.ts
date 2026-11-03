import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";

/** One still from a live session, already upright and small (long side at most 1024 px). */
export type LiveFrame = { uri: string; width: number; height: number; base64: string; takenAt: number };

/**
 * Where live frames come from. The phone camera implements this today. Meta glasses would implement the same
 * contract (a still every few seconds from the glasses' camera stream), so the session screen doesn't change.
 * See DECISIONS.md D-016 for why glasses are not built yet.
 */
export interface FrameSource {
  id: "phone" | "glasses";
  label: string;
  captureFrame(): Promise<LiveFrame>;
}

const MAX_SIDE = 1024;

/** Straighten, shrink and re-encode a picture so it is small to send and matches what the person sees. */
export async function toLiveFrame(uri: string, maxSide = MAX_SIDE): Promise<LiveFrame> {
  const rendered = await ImageManipulator.manipulate(uri, { maxWidth: maxSide, maxHeight: maxSide }).renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  if (!out.base64) throw new Error("The frame couldn't be prepared.");
  return { uri: out.uri, width: out.width, height: out.height, base64: out.base64, takenAt: Date.now() };
}

/** Delete a temporary picture. Frames are only kept by saving them as evidence; everything else is removed. */
export function discardFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* already gone, or not a local file */
  }
}

/** The subset of the camera view the phone source needs (kept loose so it can be faked in tests). */
export type PictureTaker = { takePictureAsync(options?: { quality?: number; shutterSound?: boolean }): Promise<{ uri: string } | undefined> };

export function phoneCameraSource(getCamera: () => PictureTaker | null): FrameSource {
  return {
    id: "phone",
    label: "Phone camera",
    async captureFrame() {
      const camera = getCamera();
      if (!camera) throw new Error("The camera isn't ready yet.");
      const picture = await camera.takePictureAsync({ quality: 0.5, shutterSound: false });
      if (!picture?.uri) throw new Error("The camera didn't return a picture.");
      try {
        return await toLiveFrame(picture.uri);
      } finally {
        discardFile(picture.uri); // the full-size original is never needed again
      }
    },
  };
}
