import { z } from "zod";

// Office report style (D-031). A template changes how a report LOOKS (name, logo, colour, header and footer text, which sections appear,
// in what order, under what heading). It never changes what the report SAYS, and it can never hide the review status, the sign-off or
// the important notice: those are not sections the template controls.

/** The report sections a template can move, hide or rename. In today's order, which is also the default. */
export const SECTION_IDS = ["summary", "siteScope", "interview", "keyFindings", "actions", "projectPlan", "photos", "materials", "openItems", "appendixChecklist", "appendixMeasurements"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** The heading each section has when the template does not rename it. */
export const SECTION_LABEL: Record<SectionId, string> = {
  summary: "Executive summary",
  siteScope: "Site and scope",
  interview: "Site interview",
  keyFindings: "Key findings",
  actions: "Recommended actions",
  projectPlan: "Project plan",
  photos: "Photos",
  materials: "Materials schedule",
  openItems: "Open items, limitations & uncertainty",
  appendixChecklist: "Checklist results (appendix)",
  appendixMeasurements: "Measurements (appendix)",
};

export const TEMPLATE_LIMITS = { name: 80, headerText: 200, footerText: 300, title: 80, logoChars: 300_000 } as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Only a PNG or JPEG data address of base64 characters can become a logo. */
const LOGO = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

export const ReportTemplateSchema = z.object({
  officeName: z.string().trim().max(TEMPLATE_LIMITS.name).optional(),
  logo: z.string().max(TEMPLATE_LIMITS.logoChars).regex(LOGO, "The logo must be a PNG or JPEG").optional(),
  accentColor: z.string().regex(HEX, "Use a colour like #0f172a").optional(),
  headerText: z.string().trim().max(TEMPLATE_LIMITS.headerText).optional(),
  footerText: z.string().trim().max(TEMPLATE_LIMITS.footerText).optional(),
  sections: z
    .array(z.object({ id: z.enum(SECTION_IDS), visible: z.boolean(), title: z.string().trim().max(TEMPLATE_LIMITS.title).optional() }))
    .max(SECTION_IDS.length),
});
export type ReportTemplate = z.infer<typeof ReportTemplateSchema>;

export const DEFAULT_TEMPLATE: ReportTemplate = { sections: SECTION_IDS.map((id) => ({ id, visible: true })) };

/**
 * Makes a template complete and safe: every section appears exactly once (those the template left out are added at the end, visible),
 * unknown or repeated sections are dropped, blank text is removed, and a colour or logo that is not valid is dropped.
 */
export function normalizeTemplate(t: unknown): ReportTemplate {
  const raw = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const seen = new Set<SectionId>();
  const sections: ReportTemplate["sections"] = [];
  for (const s of Array.isArray(raw.sections) ? raw.sections : []) {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const id = o.id as SectionId;
    if (!SECTION_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    const title = text(o.title, TEMPLATE_LIMITS.title);
    sections.push({ id, visible: o.visible !== false, ...(title ? { title } : {}) });
  }
  for (const id of SECTION_IDS) if (!seen.has(id)) sections.push({ id, visible: true });
  const officeName = text(raw.officeName, TEMPLATE_LIMITS.name);
  const headerText = text(raw.headerText, TEMPLATE_LIMITS.headerText);
  const footerText = text(raw.footerText, TEMPLATE_LIMITS.footerText);
  const accentColor = typeof raw.accentColor === "string" && HEX.test(raw.accentColor) ? raw.accentColor : undefined;
  const logo = typeof raw.logo === "string" && raw.logo.length <= TEMPLATE_LIMITS.logoChars && LOGO.test(raw.logo) ? raw.logo : undefined;
  return { ...(officeName ? { officeName } : {}), ...(logo ? { logo } : {}), ...(accentColor ? { accentColor } : {}), ...(headerText ? { headerText } : {}), ...(footerText ? { footerText } : {}), sections };
}

export type ResolvedTemplate = {
  /** The sections to show, in order. */
  order: SectionId[];
  /** Heading for a section: the template's own, or the default. */
  title: (id: SectionId, fallback: string) => string;
  /** The template's own heading for a section, if it has one. */
  custom: (id: SectionId) => string | undefined;
  officeName?: string;
  logo?: string;
  accentColor: string;
  headerText?: string;
  footerText?: string;
};

export const DEFAULT_ACCENT = "#0f172a";

/** What the renderers use. With no template (older reports) this describes today's report exactly. */
export function resolveTemplate(t: unknown): ResolvedTemplate {
  const n = normalizeTemplate(t);
  const titles = new Map(n.sections.filter((s) => s.title).map((s) => [s.id, s.title as string]));
  return {
    order: n.sections.filter((s) => s.visible).map((s) => s.id),
    title: (id, fallback) => titles.get(id) ?? fallback,
    custom: (id) => titles.get(id),
    officeName: n.officeName,
    logo: n.logo,
    accentColor: n.accentColor ?? DEFAULT_ACCENT,
    headerText: n.headerText,
    footerText: n.footerText,
  };
}

/** True when a template is set at all (so renderers can keep the exact old output for reports without one). */
export const hasTemplate = (t: unknown): boolean => !!t && typeof t === "object" && Object.keys(t as object).length > 0;
