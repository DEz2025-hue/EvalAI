import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AiAdapterError, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, inspectWav } from "@eval-ai/ai-adapter";

// Muse Voice Transcribe accepts ONLY mono 16-bit PCM WAV at 16/24 kHz (≤10 min, ≤32 MB).
// Browsers record webm/opus and phones record m4a/aac, so recordings are converted here, on the server.

const TARGET_RATE = 16000;
/** Chunk length kept under Meta's 10 minute limit. */
const CHUNK_SECONDS = 540;
/** Hard cap on how much audio one request will transcribe (cost + serverless time). */
export const MAX_TOTAL_SECONDS = 30 * 60;
const CONVERT_TIMEOUT_MS = 40_000;

export function ffmpegBinary(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const p = require("ffmpeg-static") as string | null;
  if (!p) throw new AiAdapterError("Audio conversion is not available on this server", "not_configured");
  return p;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr = (stderr + String(d)).slice(-2000); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new AiAdapterError("Audio conversion took too long", "unsupported_audio")); }, timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); reject(new AiAdapterError("Audio conversion is not available: " + e.message, "not_configured")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new AiAdapterError("This audio format could not be read — record again or type the note", "unsupported_audio"));
      void stderr;
    });
  });
}

function isWav(bytes: Uint8Array): boolean {
  try { inspectWav(bytes); return true; } catch { return false; }
}

/** Build a canonical 44-byte-header mono 16-bit PCM WAV around raw samples. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const buf = Buffer.alloc(44 + pcm.length);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + pcm.length, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(pcm.length, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(buf, 44);
  return new Uint8Array(buf);
}

/** Locate the PCM payload of a WAV produced by ffmpeg (header sizes can vary, so walk the chunks). */
function wavPcm(wav: Uint8Array): { pcm: Uint8Array; sampleRate: number } {
  const info = inspectWav(wav);
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = String.fromCharCode(wav[offset], wav[offset + 1], wav[offset + 2], wav[offset + 3]);
    const size = dv.getUint32(offset + 4, true);
    if (id === "data") return { pcm: wav.subarray(offset + 8, offset + 8 + Math.min(size, wav.length - offset - 8)), sampleRate: info.sampleRate };
    offset += 8 + size + (size % 2);
  }
  throw new AiAdapterError("WAV has no audio data", "unsupported_audio");
}

/** Split a WAV into chunks that each fit Meta's limits. Returns the input unchanged when it already fits. */
export function splitWav(wav: Uint8Array, chunkSeconds = CHUNK_SECONDS): Uint8Array[] {
  const info = inspectWav(wav);
  if (info.durationSec <= MAX_AUDIO_SECONDS && wav.length <= MAX_AUDIO_BYTES) return [wav];
  const { pcm, sampleRate } = wavPcm(wav);
  const bytesPerChunk = chunkSeconds * sampleRate * 2;
  const out: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += bytesPerChunk) out.push(pcmToWav(pcm.subarray(i, Math.min(i + bytesPerChunk, pcm.length)), sampleRate));
  return out;
}

/**
 * Convert any recording ffmpeg can read (webm/opus, m4a/aac, mp3, ogg, wav …) to mono 16 kHz 16-bit WAV chunks.
 * Input and output go through temp files because MP4/M4A recordings often keep their index at the end and cannot be piped.
 */
export async function toTranscribableWavChunks(input: Uint8Array): Promise<Uint8Array[]> {
  if (input.length < 100) throw new AiAdapterError("The recording is empty", "unsupported_audio");
  if (input.length > 50 * 1024 * 1024) throw new AiAdapterError("The recording is too large", "unsupported_audio");

  let wav: Uint8Array;
  const alreadyOk = isWav(input);
  if (alreadyOk) {
    wav = input;
  } else {
    const id = randomUUID();
    const inFile = path.join(os.tmpdir(), `evalai-${id}.in`);
    const outFile = path.join(os.tmpdir(), `evalai-${id}.wav`);
    try {
      fs.writeFileSync(inFile, input);
      await run(ffmpegBinary(), ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", inFile, "-vn", "-ac", "1", "-ar", String(TARGET_RATE), "-sample_fmt", "s16", "-t", String(MAX_TOTAL_SECONDS), "-f", "wav", outFile], CONVERT_TIMEOUT_MS);
      wav = new Uint8Array(fs.readFileSync(outFile));
    } finally {
      for (const f of [inFile, outFile]) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
    }
  }
  const info = inspectWav(wav);
  if (info.durationSec < 0.3) throw new AiAdapterError("The recording is too short to transcribe", "unsupported_audio");
  if (info.durationSec > MAX_TOTAL_SECONDS) throw new AiAdapterError("The recording is longer than 30 minutes — record it in parts", "unsupported_audio");
  return splitWav(wav);
}
