import { z } from 'zod'

/**
 * Brand Skin token set (TSD §17). Color tokens are OKLCH strings (no raw hex in
 * UI code); `radius` is a CSS length; `fontHeading`/`fontBody` are font-family
 * names — so only the color fields carry OKLCH values. Stored in
 * `workspace_themes.tokens` and mirrored by the default row from tokens.css.
 */
const ColorToken = z.string() // OKLCH string, e.g. "oklch(0.68 0.2 40)"

export const ThemeTokensSchema = z.object({
  primary: ColorToken,
  primaryFg: ColorToken,
  secondary: ColorToken,
  accent: ColorToken,
  surface: z.array(ColorToken).length(4),
  text: z.object({ hi: ColorToken, mid: ColorToken, low: ColorToken }),
  border: ColorToken,
  success: ColorToken,
  warning: ColorToken,
  danger: ColorToken,
  radius: z.string(), // CSS length, e.g. "12px"
  fontHeading: z.string(), // font-family name
  fontBody: z.string(), // font-family name
})
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>
