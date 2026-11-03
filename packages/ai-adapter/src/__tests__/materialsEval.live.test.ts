// LIVE evaluation of the materials proposal. Off by default: it calls the real AI provider (a few cents per case) with MADE-UP data only.
//
//   LIVE_MATERIALS_EVAL=1 pnpm --filter @eval-ai/ai-adapter exec vitest run src/__tests__/materialsEval.live.test.ts
//
// It reads the provider settings from apps/web/.env.local (never printed) and writes each case's proposal and the automated check results to
// packages/ai-adapter/eval-output/materials-eval-latest.md for a person to read against the rubric in eval-ai md/TEST_PLAN.md.
import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { proposeMaterials } from "../materialsDraft";
import { MATERIALS_CASES, checkMaterials } from "./fixtures/materialsCases";

const root = path.join(__dirname, "../../../..");

function loadEnv() {
  const file = path.join(root, "apps/web/.env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && /^(AI_PROVIDER|AI_PROVIDER_API_KEY|AI_PROVIDER_BASE_URL|META_API_KEY|OPENROUTER_API_KEY|META_BASE_URL|OPENROUTER_BASE_URL|META_SPARK_MODEL)$/.test(m[1])) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

describe.skipIf(!process.env.LIVE_MATERIALS_EVAL)("live materials evaluation", () => {
  it("proposes materials for every case and checks them", async () => {
    loadEnv();
    const out: string[] = [`# Materials evaluation (live)\n\nRun at ${new Date().toISOString()} with made-up data. Score each proposal against the rubric in TEST_PLAN.md (D-029). Quantities for rule items are calculated by the web server, not here, so the rule inputs are shown.\n`];
    let problemCount = 0;
    for (const c of MATERIALS_CASES) {
      const t0 = Date.now();
      let section = `\n---\n\n## ${c.title}\n\n_${c.tests}_\n\n`;
      try {
        const r = await proposeMaterials(c.input);
        const checks = checkMaterials(c, r);
        problemCount += checks.problems.length;
        section += `Time: ${((Date.now() - t0) / 1000).toFixed(1)} s. Items: ${r.items.length}.\n\n`;
        section += `**Automated checks:** ${checks.problems.length ? "PROBLEMS\n" + checks.problems.map((p) => "- " + p).join("\n") : "no problems"}\n${checks.notes.map((n) => "- note: " + n).join("\n")}\n\n`;
        section += `### Design basis\n\n${r.designBasis}\n\n### Add these and run again\n\n${r.missingInputs.map((m) => "- " + m).join("\n") || "(none)"}\n\n### Items\n\n`;
        section += r.items.map((i, n) => `**${n + 1}. ${i.description}** (${i.group})\n\n- Specification: ${i.specification || "(none)"}\n- Quantity: ${i.method}${i.ruleId ? ` ${i.ruleId} ${JSON.stringify(i.ruleInputs)}` : ""}${i.estimate ? ` ${i.estimate} ${i.unit}` : ""}\n- Why: ${i.rationale}\n- Assumptions: ${i.assumptions.join("; ") || "(none)"}\n- Based on: ${i.basis.map((b) => `${b.kind}: ${b.ref}`).join("; ") || "(none)"}\n`).join("\n") + "\n";
      } catch (e) {
        problemCount += 1;
        section += `**FAILED:** ${e instanceof Error ? e.message : String(e)}\n`;
      }
      out.push(section);
    }
    out.push(`\n---\n\nAutomated problems across all cases: ${problemCount}\n`);
    const dir = path.join(root, "packages/ai-adapter/eval-output");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "materials-eval-latest.md"), out.join(""));
  }, 600_000);
});
