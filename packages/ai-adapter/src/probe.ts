import { deflateSync } from "node:zlib";
import { getAdapterConfig, type AdapterConfig, type Operation } from "./config";
import { AiAdapterError, metaRequest } from "./client";
import { chatJson } from "./chat";
import { transcribeWav } from "./voice";

// Admin diagnostics: confirms the configured models exist and that each capability actually answers.
// Uses synthetic data only and the smallest possible requests. Returns provider error CODES, never secrets.

export type ProbeCheck = { name: string; ok: boolean; latencyMs: number; detail: string };

/** 64x64 solid-red PNG, built in code (zlib + CRC32) so no image library or hand-typed bytes are needed. */
function syntheticPng(): string {
  const w = 64, h = 64;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) { raw[o + 1 + x * 3] = 220; raw[o + 2 + x * 3] = 20; raw[o + 3 + x * 3] = 20; }
  }
  const table: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const byte of buf) c = table[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return png.toString("base64");
}

function silentWav(seconds = 1, rate = 16000): Uint8Array {
  const dataLen = rate * seconds * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(dataLen, 40);
  return new Uint8Array(buf);
}

async function timed(name: string, fn: () => Promise<string>): Promise<ProbeCheck> {
  const t0 = Date.now();
  try {
    return { name, ok: true, latencyMs: Date.now() - t0, detail: await fn() };
  } catch (e) {
    const detail = e instanceof AiAdapterError ? `${e.code}${e.providerCode ? ` (${e.providerCode})` : ""}: ${e.message}` : e instanceof Error ? e.message : String(e);
    return { name, ok: false, latencyMs: Date.now() - t0, detail };
  }
}

export async function probeProvider(cfg: AdapterConfig = getAdapterConfig(), opts: { includeSam?: boolean } = {}): Promise<{ ok: boolean; checks: ProbeCheck[] }> {
  const checks: ProbeCheck[] = [];
  const configured = new Map<string, Operation[]>();
  for (const [op, oc] of Object.entries(cfg.ops) as Array<[Operation, { model: string }]>) configured.set(oc.model, [...(configured.get(oc.model) ?? []), op]);

  let available: string[] = [];
  checks.push(
    await timed("Model catalog (GET /v1/models)", async () => {
      const res = await metaRequest(cfg, "/models", { method: "GET" }, { timeoutMs: 15_000, maxRetries: 1 });
      available = ((res.data as { data?: Array<{ id: string }> })?.data ?? []).map((m) => m.id);
      return `${available.length} models available`;
    }),
  );

  if (available.length > 0) {
    const missing = [...configured.keys()].filter((m) => !available.includes(m));
    checks.push({
      name: "Configured model ids exist",
      ok: missing.length === 0,
      latencyMs: 0,
      detail: missing.length === 0 ? [...configured.keys()].join(", ") : `Not in the provider catalog: ${missing.join(", ")}`,
    });
  }

  checks.push(
    await timed("Structured JSON output (text model)", async () => {
      const probeCfg: AdapterConfig = { ...cfg, ops: { ...cfg.ops, clarifyContext: { ...cfg.ops.clarifyContext, reasoningEffort: "minimal", maxCompletionTokens: 300, timeoutMs: 30_000 } } };
      const { data, usage } = await chatJson(probeCfg, "clarifyContext", {
        system: "Reply only with JSON matching the schema.",
        user: "Name one colour of the rainbow.",
        schemaName: "probe",
        schema: { type: "object", properties: { colour: { type: "string" } }, required: ["colour"], additionalProperties: false },
      });
      return `answered ${JSON.stringify(data)} (${usage.totalTokens} tokens)`;
    }),
  );

  checks.push(
    await timed("Image input (vision)", async () => {
      const probeCfg: AdapterConfig = { ...cfg, ops: { ...cfg.ops, analyzeImage: { ...cfg.ops.analyzeImage, reasoningEffort: "minimal", maxCompletionTokens: 300, timeoutMs: 30_000 } } };
      const { data } = await chatJson(probeCfg, "analyzeImage", {
        system: "Reply only with JSON matching the schema.",
        user: [{ type: "text", text: "What is the dominant colour of this image?" }, { type: "image_url", image_url: { url: "data:image/png;base64," + syntheticPng() } }],
        schemaName: "probe_image",
        schema: { type: "object", properties: { colour: { type: "string" } }, required: ["colour"], additionalProperties: false },
      });
      return `answered ${JSON.stringify(data)}`;
    }),
  );

  checks.push(
    await timed("Voice transcription (silent 1 s WAV)", async () => {
      try {
        await transcribeWav(silentWav(), {});
        return "endpoint answered";
      } catch (e) {
        // Silence legitimately yields "no speech detected" — the endpoint worked.
        if (e instanceof AiAdapterError && e.code === "invalid_response" && /No speech/.test(e.message)) return "endpoint answered (no speech in the silent clip, as expected)";
        throw e;
      }
    }),
  );

  if (opts.includeSam) {
    const { samSegment } = await import("./sam");
    checks.push(await timed("Segmentation (SAM)", async () => { await samSegment({ imageBase64: syntheticPng(), mimeType: "image/png", prompt: "red square" }); return "endpoint answered"; }));
  }

  return { ok: checks.every((c) => c.ok), checks };
}
