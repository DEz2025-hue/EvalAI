import { z } from "zod";

import { quotationTotalAmount, type PricedLine } from "./money";

export const QuotationItem = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unitPrice: z.number().nonnegative(),
  currency: z.string().length(3), // ISO 4217
  taxesOrFees: z.number().optional(),
  lineTotal: z.number().optional(), // quantity * unitPrice + taxes
});

export const Quotation = z.object({
  id: z.string(),
  materialsVersionId: z.string(), // ties quote to exact materials version — stale if materials change
  supplier: z.string().min(1),
  reference: z.string().optional(),
  date: z.string(), // ISO date
  currency: z.string().length(3),
  validityDays: z.number().optional(),
  items: z.array(QuotationItem).min(1),
  attachmentKey: z.string().optional(), // private storage key
  total: z.number().optional(), // sum lineTotals, deterministic
  stale: z.boolean().default(false), // true if materialsVersionId != current
  reviewStatus: z.enum(["pending", "approved", "stale_needs_review"]).default("pending"),
});
export type Quotation = z.infer<typeof Quotation>;

/** Exact total (integer minor units internally); all lines must use the quotation currency. */
export function quotationTotal(q: Quotation): number {
  return quotationTotalAmount(q.items as PricedLine[], q.currency);
}

export function isStale(quote: Quotation, currentMaterialsVersion: string): boolean {
  return quote.materialsVersionId !== currentMaterialsVersion;
}
