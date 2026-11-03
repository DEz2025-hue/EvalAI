import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// A recording or photo made on the phone must be read with expo-file-system. React Native's fetch(file://...) can return an
// empty body, which showed up as "the recording is empty" for a recording that was fine on the phone.
const root = path.join(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("local files are read safely on the phone", () => {
  it("uploads and voice notes use readLocalFile, never fetch(file uri) directly", () => {
    expect(read("apps/mobile/lib/upload.ts")).toContain("readLocalFile(opts.uri)");
    expect(read("apps/mobile/lib/upload.ts")).not.toMatch(/await fetch\(opts\.uri\)/);
    const voice = read("apps/mobile/components/VoiceRecorderMobile.tsx");
    expect(voice).toContain("readLocalFile(uri)");
    expect(voice).not.toMatch(/await fetch\(uri\)/);
    const photos = read("apps/mobile/components/PhotoCaptureMobile.tsx");
    expect(photos).toContain("readLocalFile(s.uri)");
    expect(photos).toContain("allowsMultipleSelection: true");
  });

  it("an empty recording is caught on the phone with a clear message, and the reason an upload failed is kept", () => {
    const voice = read("apps/mobile/components/VoiceRecorderMobile.tsx");
    expect(voice).toContain("MIN_RECORDING_BYTES");
    expect(voice).toContain("Nothing was recorded");
    expect(voice).toContain("uploadProblem");
  });

  it("the server says how many bytes reached it", () => {
    expect(read("apps/web/lib/audio.ts")).toContain("bytes reached the server");
  });
});
