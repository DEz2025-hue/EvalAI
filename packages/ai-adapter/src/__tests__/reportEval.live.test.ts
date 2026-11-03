// LIVE evaluation of the report write-up. Off by default: it calls the real AI provider (a few cents per case) with MADE-UP data only.
//
//   LIVE_REPORT_EVAL=1 pnpm --filter @eval-ai/ai-adapter exec vitest run src/__tests__/reportEval.live.test.ts
//
// It reads the provider settings from apps/web/.env.local (never printed), writes each case's report and the automated check results to
// packages/ai-adapter/eval-output/report-eval-latest.md for a person to read against the rubric in eval-ai md/TEST_PLAN.md.
import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { draftReportNarrative } from "../reportDraft";
import { REPORT_CASES, checkReport } from "./fixtures/reportCases";

const root = path.join(__dirname, "../../../..");

function loadEnv() {
  const file = path.join(root, "apps/web/.env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && /^(AI_PROVIDER|AI_PROVIDER_API_KEY|AI_PROVIDER_BASE_URL|META_API_KEY|OPENROUTER_API_KEY|META_BASE_URL|OPENROUTER_BASE_URL|META_SPARK_MODEL)$/.test(m[1])) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

describe.skipIf(!process.env.LIVE_REPORT_EVAL)("live report evaluation", () => {
  it("writes every case and checks it", async () => {
    loadEnv();
    const out: string[] = [`# Report evaluation (live)\n\nRun at ${new Date().toISOString()} with made-up data. Score each report against the rubric in TEST_PLAN.md (D-028).\n`];
    let problemCount = 0;
    for (const c of REPORT_CASES) {
      const t0 = Date.now();
      let section = `\n---\n\n## ${c.title}\n\n_${c.tests}_\n\n`;
      try {
        const r = await draftReportNarrative(c.input);
        const checks = checkReport(c, r);
        problemCount += checks.problems.length;
        section += `Time: ${((Date.now() - t0) / 1000).toFixed(1)} s. Findings: ${r.keyFindings.length}.\n\n`;
        section += `**Automated checks:** ${checks.problems.length ? "PROBLEMS\n" + checks.problems.map((p) => "- " + p).join("\n") : "no problems"}\n${checks.notes.map((n) => "- note: " + n).join("\n")}\n\n`;
        section += `### Executive summary\n\n${r.summary}\n\n### Site and scope\n\n${r.siteOverview || "(none)"}\n\n### Key findings\n\n`;
        section += r.keyFindings.map((f, i) => `**${i + 1}. ${f.title}** (${f.priority})\n\n- Observed: ${f.observed}\n- What it means: ${f.meaning}\n- Action: ${f.action}\n- Based on: ${f.basis.map((b) => `${b.kind}: ${b.ref}`).join("; ") || "(none)"}\n`).join("\n") + "\n";
        section += `### Open items\n\n${r.openItems || "(none)"}\n\nMissing information: ${r.missingInformation.join("; ") || "(none)"}\n`;
      } catch (e) {
        problemCount += 1;
        section += `**FAILED:** ${e instanceof Error ? e.message : String(e)}\n`;
      }
      out.push(section);
    }
    out.push(`\n---\n\nAutomated problems across all cases: ${problemCount}\n`);
    const dir = path.join(root, "packages/ai-adapter/eval-output");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "report-eval-latest.md"), out.join(""));
  }, 600_000);
});
