import { z } from 'zod';

export const BrandSchema = z.object({
  companyName: z.string().min(1),
  productDisplayName: z.string().min(1).optional(),
  logo: z.object({
    full: z.string().url(),
    icon: z.string().url(),
    darkVariant: z.string().url().nullable().optional(),
  }),
});

export type BrandConfig = z.infer<typeof BrandSchema>;
