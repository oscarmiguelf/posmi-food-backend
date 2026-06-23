import { z } from 'zod';

/** Map of module key → dependency keys that must also be enabled. */
const MODULE_DEPS: Partial<Record<string, string[]>> = {
  purchaseSuggestions: ['purchasing'],
  loyalty: ['reservations'],
};

export const ModulesSchema = z
  .object({
    modules: z.object({
      reservations: z.boolean(),
      loyalty: z.boolean(),
      purchasing: z.boolean(),
      purchaseSuggestions: z.boolean(),
    }),
  })
  .superRefine((val, ctx) => {
    for (const [mod, deps] of Object.entries(MODULE_DEPS)) {
      if (val.modules[mod as keyof typeof val.modules]) {
        for (const dep of deps ?? []) {
          if (!val.modules[dep as keyof typeof val.modules]) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['modules', mod],
              message: `module "${mod}" requires "${dep}" to also be enabled`,
            });
          }
        }
      }
    }
  });

export type ModulesConfig = z.infer<typeof ModulesSchema>;
