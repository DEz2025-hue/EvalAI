import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectWav } from "@eval-ai/ai-adapter";
import { ffmpegBinary, pcmToWav, splitWav, toTranscribableWavChunks } from "../audio";

/** Make a short sine tone WAV (stereo 44.1 kHz so conversion actually has work to do). */
function tone(seconds: number, rate = 44100, channels = 2): Uint8Array {
  const frames = Math.floor(rate * seconds);
  const pcm = Buffer.alloc(frames * channels * 2);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000);
    for (let c = 0; c < channels; c++) pcm.writeInt16LE(v, (i * channels + c) * 2);
  }
  const buf = Buffer.alloc(44 + pcm.length);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + pcm.length, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * channels * 2, 28); buf.writeUInt16LE(channels * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(pcm.length, 40); pcm.copy(buf, 44);
  return new Uint8Array(buf);
}

/** Encode a fixture into another container using the same ffmpeg the server uses. */
function encode(wav: Uint8Array, ext: string, args: string[]): Uint8Array {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evalai-audio-"));
  try {
    const src = path.join(dir, "in.wav");
    const dst = path.join(dir, "out." + ext);
    fs.writeFileSync(src, wav);
    const r = spawnSync(ffmpegBinary(), ["-hide_banner", "-loglevel", "error", "-y", "-i", src, ...args, dst]);
    if (r.status !== 0) throw new Error("fixture encode failed: " + String(r.stderr));
    return new Uint8Array(fs.readFileSync(dst));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("recording conversion for Muse Voice Transcribe", () => {
  it("converts browser webm/opus to mono 16 kHz 16-bit WAV", async () => {
    const webm = encode(tone(2), "webm", ["-c:a", "libopus"]);
    const [wav] = await toTranscribableWavChunks(webm);
    const info = inspectWav(wav);
    expect(info).toMatchObject({ channels: 1, sampleRate: 16000, bitsPerSample: 16 });
    expect(info.durationSec).toBeGreaterThan(1.8);
    expect(info.durationSec).toBeLessThan(2.3);
  });

  it("converts phone m4a/aac (index at the end of the file) to the same format", async () => {
    const m4a = encode(tone(2), "m4a", ["-c:a", "aac"]);
    const [wav] = await toTranscribableWavChunks(m4a);
    expect(inspectWav(wav)).toMatchObject({ channels: 1, sampleRate: 16000, bitsPerSample: 16 });
  });

  it("downmixes and resamples an arbitrary WAV (stereo 44.1 kHz)", async () => {
    const [wav] = await toTranscribableWavChunks(tone(1.5));
    expect(inspectWav(wav)).toMatchObject({ channels: 1, sampleRate: 16000 });
  });

  it("passes an already-valid mono 16 kHz WAV through untouched", async () => {
    const ok = tone(1, 16000, 1);
    const [wav] = await toTranscribableWavChunks(ok);
    expect(wav).toBe(ok);
  });

  it("rejects non-audio, empty and too-short input with a clear error", async () => {
    await expect(toTranscribableWavChunks(new TextEncoder().encode("<html>not audio</html>".repeat(20)))).rejects.toMatchObject({ code: "unsupported_audio" });
    await expect(toTranscribableWavChunks(new Uint8Array(10))).rejects.toMatchObject({ code: "unsupported_audio" });
    await expect(toTranscribableWavChunks(tone(0.1, 16000, 1))).rejects.toThrow(/too short/);
  });

  it("splits long recordings into chunks under the 10 minute limit and keeps every sample", () => {
    const rate = 16000;
    const pcm = new Uint8Array(rate * 2 * 1300); // 21.7 minutes of silence
    const chunks = splitWav(pcmToWav(pcm, rate));
    expect(chunks.length).toBe(3); // 540 s + 540 s + 220 s
    for (const c of chunks) expect(inspectWav(c).durationSec).toBeLessThanOrEqual(600);
    expect(chunks.reduce((n, c) => n + inspectWav(c).dataBytes, 0)).toBe(pcm.length);
  });

  it("does not split a recording that already fits", () => {
    const short = pcmToWav(new Uint8Array(16000 * 2 * 30), 16000);
    expect(splitWav(short)).toEqual([short]);
  });
});
