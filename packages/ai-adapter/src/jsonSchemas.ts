import type { JsonSchema } from "./chat";

// JSON Schemas sent as response_format.json_schema. Written to satisfy Meta's "strict" subset too (root object,
// every property required, additionalProperties:false, no oneOf/allOf, no recursion, depth ≤ 10) so strict mode can be switched on
// after live verification. "Optional" values are modelled as empty strings / empty arrays, never null.

const str = { type: "string" } as const;
const strArray = { type: "array", items: str, maxItems: 20 } as const;
const bool = { type: "boolean" } as const;

export function clarifySchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            id: str,
            question: str,
            required: bool,
            type: { type: "string", enum: ["text", "number", "select", "boolean"] },
            options: { type: "array", items: str, maxItems: 12 },
            rationale: str,
          },
          required: ["id", "question", "required", "type", "options", "rationale"],
          additionalProperties: false,
        },
      },
      missing_critical: strArray,
      assumptions: strArray,
    },
    required: ["questions", "missing_critical", "assumptions"],
    additionalProperties: false,
  };
}

export function checklistSchema(maxItems: number): JsonSchema {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        maxItems: Math.max(1, Math.min(50, maxItems)),
        items: {
          type: "object",
          properties: { title: str, instructions: str, required: bool, category: str, rationale: str },
          required: ["title", "instructions", "required", "category", "rationale"],
          additionalProperties: false,
        },
      },
      warnings: strArray,
    },
    required: ["items", "warnings"],
    additionalProperties: false,
  };
}

/** Evidence references are constrained to the ids that really exist for the job, so the model cannot invent one. */
function evidenceRefs(ids: string[]): JsonSchema {
  const known = ids.slice(0, 500);
  return known.length > 0 ? { type: "array", items: { type: "string", enum: known }, maxItems: 20 } : { type: "array", items: str, maxItems: 0 };
}

export function analyzeSchema(evidenceIds: string[]): JsonSchema {
  return {
    type: "object",
    properties: {
      summary: str,
      observations: strArray,
      potential_findings: {
        type: "array",
        maxItems: 15,
        items: {
          type: "object",
          properties: {
            title: str,
            description: str,
            severity: { type: "string", enum: ["low", "medium", "high", "none"] },
            evidence_refs: evidenceRefs(evidenceIds),
            uncertainty: { type: "string", enum: ["low", "medium", "high"] },
            missing_inputs: strArray,
          },
          required: ["title", "description", "severity", "evidence_refs", "uncertainty", "missing_inputs"],
          additionalProperties: false,
        },
      },
      recommendations: strArray,
      missing_information: strArray,
      assumptions: strArray,
      uncertainty: { type: "string", enum: ["low", "medium", "high"] },
      evidence_references: evidenceRefs(evidenceIds),
    },
    required: ["summary", "observations", "potential_findings", "recommendations", "missing_information", "assumptions", "uncertainty", "evidence_references"],
    additionalProperties: false,
  };
}

export function imageSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      summary: str,
      observations: strArray,
      limitations: strArray,
      uncertainty: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["summary", "observations", "limitations", "uncertainty"],
    additionalProperties: false,
  };
}

export function reportDraftSchema(): JsonSchema {
  return {
    type: "object",
    properties: { summary: str, recommendations: str, missing_information: strArray },
    required: ["summary", "recommendations", "missing_information"],
    additionalProperties: false,
  };
}
