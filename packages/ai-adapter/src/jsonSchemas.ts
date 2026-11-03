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

export function photoReviewSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      photos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            evidence_id: str,
            caption: str,
            observations: strArray,
            possible_issues: {
              type: "array",
              items: {
                type: "object",
                properties: { text: str, confidence: { type: "string", enum: ["low", "medium", "high"] } },
                required: ["text", "confidence"],
                additionalProperties: false,
              },
            },
            cannot_tell: strArray,
          },
          required: ["evidence_id", "caption", "observations", "possible_issues", "cannot_tell"],
          additionalProperties: false,
        },
      },
    },
    required: ["photos"],
    additionalProperties: false,
  };
}

export function siteIntakeSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      start_here: {
        type: "object",
        properties: { item_id: str, title: str, reason: str },
        required: ["item_id", "title", "reason"],
        additionalProperties: false,
      },
      new_items: {
        type: "array",
        items: {
          type: "object",
          properties: { title: str, look_for: str, why: str, category: str },
          required: ["title", "look_for", "why", "category"],
          additionalProperties: false,
        },
      },
      guidance_updates: {
        type: "array",
        items: {
          type: "object",
          properties: { item_id: str, look_for: str },
          required: ["item_id", "look_for"],
          additionalProperties: false,
        },
      },
      visible: strArray,
      limitations: strArray,
      uncertainty: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["start_here", "new_items", "guidance_updates", "visible", "limitations", "uncertainty"],
    additionalProperties: false,
  };
}

export function liveFrameSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      notes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: str,
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            /** An id from the checklist in the request, or an empty string when the note isn't about one item. */
            checklist_item_id: str,
          },
          required: ["text", "confidence", "checklist_item_id"],
          additionalProperties: false,
        },
      },
      /** A short tip to get a better picture ("move closer", "more light"), or an empty string. */
      better_shot_tip: str,
      /** Parts of the item's "look for" text that this picture shows / that are still to be shown. Empty without a look-for text. */
      seen: strArray,
      still_to_show: strArray,
      limitations: strArray,
      uncertainty: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["notes", "better_shot_tip", "seen", "still_to_show", "limitations", "uncertainty"],
    additionalProperties: false,
  };
}

export function reportDraftSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      summary: str,
      site_overview: str,
      key_findings: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            title: str,
            priority: { type: "string", enum: ["high", "medium", "low", "info"] },
            observed: str,
            meaning: str,
            action: str,
            // Where it comes from, so each source can be checked against the real report.
            item_titles: strArray,
            photo_numbers: { type: "array", items: { type: "integer" }, maxItems: 12 },
            measurement_names: strArray,
            finding_titles: strArray,
          },
          required: ["title", "priority", "observed", "meaning", "action", "item_titles", "photo_numbers", "measurement_names", "finding_titles"],
          additionalProperties: false,
        },
      },
      open_items: str,
      missing_information: strArray,
      assumptions: strArray,
    },
    required: ["summary", "site_overview", "key_findings", "open_items", "missing_information", "assumptions"],
    additionalProperties: false,
  };
}

/** The next interview question. */
export function interviewTurnSchema(): JsonSchema {
  return {
    type: "object",
    properties: { question: str, why: str, topic: str, done: bool },
    required: ["question", "why", "topic", "done"],
    additionalProperties: false,
  };
}

/** Proposals from a finished interview. Every proposal carries an exact quote from the person. */
export function interviewDigestSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      item_notes: {
        type: "array",
        maxItems: 24,
        items: { type: "object", properties: { item_title: str, note: str, quote: str }, required: ["item_title", "note", "quote"], additionalProperties: false },
      },
      finding_drafts: {
        type: "array",
        maxItems: 12,
        items: { type: "object", properties: { title: str, description: str, quotes: strArray }, required: ["title", "description", "quotes"], additionalProperties: false },
      },
      brief_lines: {
        type: "array",
        maxItems: 16,
        items: { type: "object", properties: { label: str, value: str, quote: str }, required: ["label", "value", "quote"], additionalProperties: false },
      },
      contradictions: {
        type: "array",
        maxItems: 6,
        items: { type: "object", properties: { statement: str, conflicts_with: str }, required: ["statement", "conflicts_with"], additionalProperties: false },
      },
      open_questions: strArray,
    },
    required: ["item_notes", "finding_drafts", "brief_lines", "contradictions", "open_questions"],
    additionalProperties: false,
  };
}

/** Materials proposal. Quantities are described by method; the arithmetic for rule items is done by code, never by the model. */
export function materialsSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      design_basis: str,
      missing_inputs: strArray,
      assumptions: strArray,
      items: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          properties: {
            group: str,
            description: str,
            specification: str,
            quantity_method: { type: "string", enum: ["rule", "estimate", "unknown"] },
            rule_id: str,
            rule_inputs: {
              type: "array",
              maxItems: 6,
              items: {
                type: "object",
                properties: {
                  name: str,
                  value: { type: "number" },
                  source: { type: "string", enum: ["measurement", "record", "assumed"] },
                  measurement_name: str,
                },
                required: ["name", "value", "source", "measurement_name"],
                additionalProperties: false,
              },
            },
            estimate_quantity: { type: "number" },
            unit: str,
            rationale: str,
            assumptions: strArray,
            item_titles: strArray,
            finding_titles: strArray,
            measurement_names: strArray,
          },
          required: ["group", "description", "specification", "quantity_method", "rule_id", "rule_inputs", "estimate_quantity", "unit", "rationale", "assumptions", "item_titles", "finding_titles", "measurement_names"],
          additionalProperties: false,
        },
      },
    },
    required: ["design_basis", "missing_inputs", "assumptions", "items"],
    additionalProperties: false,
  };
}

/** Stage 2: only the summary and open items, written from findings the person has already edited. */
export function reportSummarySchema(): JsonSchema {
  return {
    type: "object",
    properties: { summary: str, open_items: str },
    required: ["summary", "open_items"],
    additionalProperties: false,
  };
}
