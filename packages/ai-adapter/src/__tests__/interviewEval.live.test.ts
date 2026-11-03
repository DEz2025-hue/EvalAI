// LIVE evaluation of the site interview. Off by default: it calls the real AI provider (a few cents) with MADE-UP data only.
//
//   LIVE_INTERVIEW_EVAL=1 pnpm --filter @eval-ai/ai-adapter exec vitest run src/__tests__/interviewEval.live.test.ts
//
// For each case it asks for the first question, then reads the scripted conversation into proposals, and writes both with the automated
// check results to packages/ai-adapter/eval-output/interview-eval-latest.md for a person to read against the rubric in eval-ai md/TEST_PLAN.md.
import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { digestInterview, nextInterviewQuestion } from "../interview";
import { INTERVIEW_CASES, checkDigest } from "./fixtures/interviewCases";

const root = path.join(__dirname, "../../../..");

function loadEnv() {
  const file = path.join(root, "apps/web/.env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && /^(AI_PROVIDER_API_KEY|AI_PROVIDER_BASE_URL|META_API_KEY|META_BASE_URL|META_SPARK_MODEL)$/.test(m[1])) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

describe.skipIf(!process.env.LIVE_INTERVIEW_EVAL)("live interview evaluation", () => {
  it("asks and digests every case", async () => {
    loadEnv();
    const out: string[] = [`# Interview evaluation (live)\n\nRun at ${new Date().toISOString()} with made-up data. Score against the rubric in TEST_PLAN.md (D-030).\n`];
    let problemCount = 0;
    for (const c of INTERVIEW_CASES) {
      let section = `\n---\n\n## ${c.title}\n\n_${c.tests}_\n\n`;
      try {
        const q = await nextInterviewQuestion({ ...c.record, turns: [], questionsAsked: 0 });
        section += `### First question\n\n${q.done ? "(done)" : q.question}\n\nTopic: ${q.topic || "(general)"} · Why: ${q.why || "(none)"}\n\n`;
        // The model's own first question, then the scripted answer: what a real session would send.
        const realTurns = q.done ? c.turns.slice(0, 2) : [{ role: "ai" as const, text: q.question }, c.turns[1]];
        const follow = await nextInterviewQuestion({ ...c.record, turns: realTurns, questionsAsked: 1 });
        section += `### Question after the first scripted answer\n\n${follow.done ? `(done: ${follow.reason})` : follow.question}\n\n`;
        const d = await digestInterview({ ...c.record, turns: c.turns });
        const checks = checkDigest(c, d);
        problemCount += checks.problems.length;
        section += `**Automated checks:** ${checks.problems.length ? "PROBLEMS\n" + checks.problems.map((p) => "- " + p).join("\n") : "no problems"}\n${checks.notes.map((n) => "- note: " + n).join("\n")}\n\n`;
        section += `### Notes for items\n\n${d.itemNotes.map((n) => `- **${n.itemTitle}**: ${n.note}\n  - said: “${n.quote}”`).join("\n") || "(none)"}\n\n`;
        section += `### Finding drafts\n\n${d.findingDrafts.map((f) => `- **${f.title}**: ${f.description}\n  - said: “${f.quotes.join("” / “")}”`).join("\n") || "(none)"}\n\n`;
        section += `### Details for the report\n\n${d.briefLines.map((b) => `- **${b.label}**: ${b.value}\n  - said: “${b.quote}”`).join("\n") || "(none)"}\n\n`;
        section += `### Contradictions\n\n${d.contradictions.map((x) => `- ${x.statement} — but: ${x.conflictsWith}`).join("\n") || "(none)"}\n\n### Still to check\n\n${d.openQuestions.map((x) => "- " + x).join("\n") || "(none)"}\n`;
      } catch (e) {
        problemCount += 1;
        section += `**FAILED:** ${e instanceof Error ? e.message : String(e)}\n`;
      }
      out.push(section);
    }
    out.push(`\n---\n\nAutomated problems across all cases: ${problemCount}\n`);
    const dir = path.join(root, "packages/ai-adapter/eval-output");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "interview-eval-latest.md"), out.join(""));
  }, 600_000);
});
