import { z } from "zod";
import { getAdapterConfig } from "./index";
import { metaFetch, modelFor, AiAdapterError } from "./client";
import { AnalyzeAssessmentInput, AnalyzeAssessmentOutput } from "./schemas";

// Muse Wonder — complex assessment reasoning, structured findings
// Verify live: POST /v1/chat/completions or /v1/models/{model} per Meta docs + synthetic data

const WonderRaw = z.object({
  summary: z.string(),
  observations: z.array(z.string()).optional(),
  potential_findings: z.array(z.any()).optional(),
  potentialFindings: z.array(z.any()).optional(),
  recommendations: z.array(z.string()).optional(),
  missing_information: z.array(z.string()).optional(),
  missingInformation: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  uncertainty: z.string().optional(),
  evidence_references: z.array(z.string()).optional(),
}).passthrough();

export async function wonderAnalyzeAssessment(input: z.infer<typeof AnalyzeAssessmentInput>) {
  const cfg = getAdapterConfig();
  const validated = AnalyzeAssessmentInput.parse(input);
  const model = modelFor("analyzeAssessment", cfg);

  try {
    const raw = await metaFetch(cfg, "/v1/chat/completions", {
      model,
      messages: [
        { role: "system", content: "You are EvalAI assessment assistant. Never invent measurements, prices, or compliance results. State assumptions, uncertainty, missing inputs. Output JSON only with keys: summary, observations, potential_findings, recommendations, missing_information, assumptions, uncertainty, evidence_references, requires_human_review." },
        { role: "user", content: JSON.stringify({ task: "analyzeAssessment", ...validated }) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    // Meta response shape varies — unwrap choices[0].message.content (JSON string) if present
    const content = extractContent(raw);
    const parsed = WonderRaw.parse(typeof content === "string" ? JSON.parse(content) : content);
    const normalized = {
      summary: parsed.summary,
      observations: parsed.observations ?? [],
      potentialFindings: (parsed.potential_findings ?? parsed.potentialFindings ?? []).map((f: unknown) => {
        const o = f as Record<string, unknown>;
        return { title: String(o.title ?? o.name ?? ""), description: String(o.description ?? ""), severity: o.severity as "low"|"medium"|"high"|undefined, evidenceRefs: (o.evidenceRefs ?? o.evidence_refs ?? []) as string[], requiresHumanReview: true };
      }),
      recommendations: parsed.recommendations ?? [],
      missingInformation: parsed.missing_information ?? parsed.missingInformation ?? [],
      assumptions: parsed.assumptions ?? [],
      uncertainty: (parsed.uncertainty as "low"|"medium"|"high") ?? "medium",
      evidenceReferences: parsed.evidence_references ?? [],
      requiresHumanReview: true as const,
    };
    return AnalyzeAssessmentOutput.parse(normalized);
  } catch (e) {
    if (e instanceof AiAdapterError) throw e;
    // Fallback labelled — never fabricate as if it were model output
    return {
      summary: "Fallback — Muse Wonder not reachable or response invalid. Manual review required.",
      observations: [],
      potentialFindings: [],
      recommendations: [],
      missingInformation: ["Wonder verification pending — check AI_PROVIDER_BASE_URL, model ID, and live synthetic test"],
      assumptions: ["Fallback, not model output"],
      uncertainty: "high" as const,
      evidenceReferences: [],
      requiresHumanReview: true as const,
      _fallback: true,
      _error: e instanceof Error ? e.message : String(e),
    };
  }
}

function extractContent(raw: unknown): unknown {
  const r = raw as Record<string, unknown>;
  // OpenAI-compatible: choices[0].message.content
  const choices = r.choices as Array<Record<string, unknown>> | undefined;
  if (choices?.[0]) {
    const msg = choices[0].message as Record<string, unknown> | undefined;
    if (msg?.content) return msg.content;
  }
  // Meta direct: output / result
  if (r.output) return r.output;
  if (r.result) return r.result;
  return raw;
}
