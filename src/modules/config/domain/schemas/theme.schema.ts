import { z } from 'zod';
import { meetsWcagAA } from './wcag';

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-digit hex color (#RRGGBB)');

export const ThemeSchema = z
  .object({
    colors: z.object({
      primary: hexColor,
      secondary: hexColor,
      danger: hexColor,
      success: hexColor,
      warning: hexColor,
      background: hexColor,
      textPrimary: hexColor,
    }),
  })
  .superRefine((val, ctx) => {
    const { textPrimary, background } = val.colors;
    if (!meetsWcagAA(textPrimary, background)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['colors', 'textPrimary'],
        message: `textPrimary (${textPrimary}) vs background (${background}) fails WCAG AA contrast (requires ≥4.5:1, section 3.11)`,
      });
    }
  });

export type ThemeConfig = z.infer<typeof ThemeSchema>;
