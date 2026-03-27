import { z } from "zod";

export const KGItemTypeSchema = z.enum(["product", "tool", "event", "service"]);

export const RiskProfileSchema = z.enum(["low", "medium", "high", "mixed"]);

export const KGItemSchema = z.object({
  id: z.string().min(1),
  type: KGItemTypeSchema,
  title: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  intentMap: z.array(z.string().min(1)).min(1),
  audience: z.array(z.string().min(1)).min(1),
  riskProfile: RiskProfileSchema,
  businessPriority: z.number().min(0).max(1),
  freshnessScore: z.number().min(0).max(1),
  eligibility: z.string().default("General eligibility applies"),
  ctaLabel: z.string().min(1),
  ctaUrl: z.string().url(),
});

export const KGDatasetSchema = z.array(KGItemSchema).min(1);

export type KGItem = z.infer<typeof KGItemSchema>;
export type KGDataset = z.infer<typeof KGDatasetSchema>;

export function validateKGDataset(input: unknown): KGDataset {
  return KGDatasetSchema.parse(input);
}
