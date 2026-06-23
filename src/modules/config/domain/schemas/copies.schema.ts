import { z } from 'zod';

export const CopiesSchema = z.object({
  locale: z.string().min(2),
  strings: z.record(z.string(), z.string()),
});

export type CopiesConfig = z.infer<typeof CopiesSchema>;
