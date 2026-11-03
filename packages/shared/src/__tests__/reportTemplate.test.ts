import { describe, it, expect } from "vitest";
import golden from "./fixtures/reportHtmlGolden.json";
import { REPORT_HTML_CASES, baseInput, findingsNarrative } from "./fixtures/reportHtmlCases";
import { buildReportHtml } from "../reportHtml";
import { DEFAULT_ACCENT, DEFAULT_TEMPLATE, ReportTemplateSchema, SECTION_IDS, normalizeTemplate, resolveTemplate, type ReportTemplate } from "../reportTemplate";
import { REPORT_DISCLAIMER, type ReportInput } from "../report";
import { previewKey } from "../reportGate";

// Whitespace between tags is not content: compare what is shown.
const flat = (h: string) => h.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
const [snap] = REPORT_HTML_CASES.findings;
const withTemplate = (template: ReportTemplate | undefined, extra: Partial<ReportInput> = {}) => buildReportHtml(snap, { ...baseInput, narrative: findingsNarrative, ...extra, ...(template ? { template } : {}) });
const headings = (h: string) => [...h.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1]);
// A tiny valid PNG as a data address.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("a report with no template is unchanged", () => {
  for (const [name, [s, input]] of Object.entries(REPORT_HTML_CASES)) {
    it(`${name}: same content as before office templates existed`, () => {
      expect(flat(buildReportHtml(s, input))).toBe(flat((golden as Record<string, string>)[name]));
    });
  }

  it("the default template describes the same report", () => {
    expect(flat(withTemplate(DEFAULT_TEMPLATE))).toBe(flat(withTemplate(undefined)));
  });
});

describe("normalising and resolving a template", () => {
  it("adds missing sections at the end, drops unknown and repeated ones, and removes blank text", () => {
    const n = normalizeTemplate({ officeName: "  ", headerText: " Hello ", sections: [{ id: "materials", visible: false }, { id: "nonsense", visible: true }, { id: "materials", visible: true }, { id: "summary", visible: true, title: "  Overview  " }] });
    expect(n.sections.map((s) => s.id)).toEqual(["materials", "summary", ...SECTION_IDS.filter((i) => i !== "materials" && i !== "summary")]);
    expect(n.sections[0].visible).toBe(false);
    expect(n.sections[1].title).toBe("Overview");
    expect(n.officeName).toBeUndefined();
    expect(n.headerText).toBe("Hello");
  });

  it("drops an invalid colour or logo instead of trusting it", () => {
    const n = normalizeTemplate({ accentColor: "red; background:url(x)", logo: "https://evil.example/x.png", sections: [] });
    expect(n.accentColor).toBeUndefined();
    expect(n.logo).toBeUndefined();
    expect(resolveTemplate({ accentColor: "#12ab34", sections: [] }).accentColor).toBe("#12ab34");
    expect(resolveTemplate(undefined).accentColor).toBe(DEFAULT_ACCENT);
    expect(resolveTemplate(undefined).order).toEqual([...SECTION_IDS]);
  });

  it("the schema rejects a bad colour, a non-image logo and unknown sections", () => {
    expect(ReportTemplateSchema.safeParse({ accentColor: "blue", sections: [] }).success).toBe(false);
    expect(ReportTemplateSchema.safeParse({ logo: "data:text/html;base64,AAAA", sections: [] }).success).toBe(false);
    expect(ReportTemplateSchema.safeParse({ sections: [{ id: "disclaimer", visible: false }] }).success).toBe(false);
    expect(ReportTemplateSchema.safeParse({ logo: PNG, accentColor: "#0f172a", sections: [{ id: "summary", visible: true }] }).success).toBe(true);
  });
});

describe("the template shapes the report", () => {
  it("reorders sections", () => {
    const order = SECTION_IDS.filter((i) => i !== "materials");
    const h = headings(withTemplate({ sections: [{ id: "materials", visible: true }, ...order.map((id) => ({ id, visible: true }))] }));
    expect(h.indexOf("Materials schedule — traceable")).toBeLessThan(h.indexOf("Executive summary"));
  });

  it("hides sections", () => {
    const h = withTemplate({ sections: [{ id: "materials", visible: false }, { id: "appendixMeasurements", visible: false }] });
    expect(h).not.toContain("Materials schedule");
    expect(h).not.toContain("Appendix B");
    expect(h).toContain("Key findings");
  });

  it("renames headings, and escapes the new text", () => {
    const h = withTemplate({ sections: [{ id: "keyFindings", visible: true, title: "What we found <script>x</script>" }, { id: "openItems", visible: true, title: "Next steps" }] });
    expect(h).toContain("<h2>What we found &lt;script&gt;x&lt;/script&gt;</h2>");
    expect(h).not.toContain("<script>x</script>");
    expect(h).toContain("<h2>Next steps</h2>");
  });

  it("uses the office name, logo, colour, header text and footer text", () => {
    const h = withTemplate({ officeName: "Bright Energy Pty", logo: PNG, accentColor: "#b91c1c", headerText: "Licence 1234", footerText: "Bright Energy · 1 Main St", sections: [] });
    expect(h).toContain("Bright Energy Pty — assessment report");
    expect(h).toContain(`<img src="${PNG}"`);
    expect(h).toContain("border-bottom:2px solid #b91c1c");
    expect(h).toContain("h1,h2{color:#b91c1c}");
    expect(h).toContain("Licence 1234");
    expect(h).toContain("Bright Energy · 1 Main St<br>Generated from versioned snapshot");
  });

  it("works on the older free-text layout too", () => {
    const [s, input] = REPORT_HTML_CASES.legacy;
    const h = buildReportHtml(s, { ...input, template: { sections: [{ id: "keyFindings", visible: true, title: "Observations" }, { id: "materials", visible: false }] } });
    expect(h).toContain("<h2>Observations</h2>");
    expect(h).not.toContain("Materials schedule");
  });

  it("the interview is its own section that can be moved or hidden", () => {
    const iv = { details: [{ label: "Night use", value: "Lights" }], statements: [], openQuestions: [] };
    const input = { siteBrief: { goal: "x", interview: iv } };
    expect(withTemplate(undefined, input)).toContain("<h2>Site interview</h2>");
    expect(withTemplate({ sections: [{ id: "interview", visible: false }] }, input)).not.toContain("Site interview");
  });
});

describe("what a template can never remove", () => {
  const hideEverything: ReportTemplate = { officeName: "X", sections: SECTION_IDS.map((id) => ({ id, visible: false })) };

  it("keeps the review status, the notice and the generated-from line, even when every section is hidden", () => {
    const h = withTemplate(hideEverything);
    expect(h).toContain("DRAFT — not yet reviewed or signed off");
    expect(h).toContain(REPORT_DISCLAIMER.slice(0, 40));
    expect(h).toContain("Generated from versioned snapshot");
  });

  it("keeps the sign-off on a finalized report", () => {
    const [fin, input] = REPORT_HTML_CASES.findingsFinal;
    const h = buildReportHtml(fin, { ...input, template: hideEverything });
    expect(h).toContain("Reviewed and signed off by");
    expect(h).toContain("Reviewer note");
  });

  it("a header text cannot inject markup", () => {
    const h = withTemplate({ headerText: "<img src=x onerror=alert(1)>", footerText: "<b>x</b>", sections: [] });
    expect(h).not.toContain("<img src=x");
    expect(h).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("the preview lock", () => {
  const draft = (template?: ReportTemplate) => ({ id: "s1", finalized: false, payload: { narrative: {}, ...(template ? { template } : {}) } });

  it("changes when the template changes, so a restyled draft must be previewed again", () => {
    const keys = new Set([previewKey(draft() as never), previewKey(draft({ officeName: "A", sections: [] }) as never), previewKey(draft({ officeName: "B", sections: [] }) as never)]);
    expect(keys.size).toBe(3);
  });
});
