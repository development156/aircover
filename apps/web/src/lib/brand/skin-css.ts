import { brandSkinVars } from './brand-theme'
import type { ThemeTokens } from '@sahoda/shared'

/**
 * The workspace's brand, as CSS the server can put in the page.
 *
 * ── WHY THIS DID NOT EXIST, WHICH IS THE WHOLE STORY ────────────────────────
 * Every part of Brand Skin was built and none of it reached the product. Colour
 * extraction, the Readability Guard, the token derivation, the versioned
 * `workspace_themes` rows and the reader above them all worked. The only callers
 * of `activeThemeTokens` were `/sites` and `/studio`, which paint a CUSTOMER'S
 * generated website, and `brandSkinVars`'s only application was in an onboarding
 * file that no longer renders. So a workspace could upload a logo, have its
 * colours extracted, guarded, derived and stored, and see the product stay
 * Sahoda orange for ever. `read-theme.ts` even records the moment the shell
 * stopped calling it: "the shell caller the note referred to no longer exists".
 *
 * ── SEVEN VARIABLES, AND NOT ONE MORE ───────────────────────────────────────
 * Design System §2: only `--p --pfg --pstrong --acc --t50 --t100 --t300` are
 * themeable. Neutrals and semantics are fixed, and danger is crimson rather than
 * a brand colour, because a workspace whose brand is red must not have its
 * delete confirmations blend into its buttons. `brandSkinVars` returns exactly
 * those seven, so this emits its output and never a key of its own choosing.
 *
 * ── IT RE-DERIVES RATHER THAN REPLAYING THE STORED ROW ──────────────────────
 * The stored `tokens` carry a primary and an accent; the tints and the hover
 * step are computed from them. Feeding the two back through `brandSkinVars`
 * means the Readability Guard runs on every render rather than once, at upload,
 * in whatever version of the guard shipped that week. A theme stored in August
 * is therefore corrected by a guard improved in September, instead of carrying
 * an old ruling about contrast for ever.
 *
 * ── AND IT IS A STRING, FOR THE SERVER TO INLINE ────────────────────────────
 * Applied as SSR CSS in the document rather than set from an effect: an effect
 * paints Sahoda orange first and the customer's brand a frame later, which is
 * the flash the design canon forbids. `null` returns an empty string, so a
 * workspace with no theme emits nothing at all and `tokens.css` stands.
 *
 * ── IT IS SCOPED, AND THAT REVERSES HOW IT FIRST SHIPPED ────────────────────
 * Founder's ruling, 2026-08-29, the same day: "Day/Night Theme Toggle should
 * apply Sahoda Brand Theme. Only the Left Brand Logo should apply Brand Skin."
 *
 * The first version wrote `:root:root`, which repainted every button, link and
 * tint in the product in whatever colour was found in the customer's logo. That
 * is a real cost and it is not one this product should charge: the light and
 * dark themes are DESIGNED, their contrast steps measured, and handing all seven
 * tokens to an automatic colour read makes the whole interface a lottery on the
 * quality of one PNG. A grey-and-white logo turned the product washed out, which
 * is exactly how the ruling arrived.
 *
 * So the brand paints the brand mark, and the theme toggle owns everything else.
 * `SKIN_SCOPE` is that boundary, in one place, so it cannot drift from the
 * element that carries the attribute.
 */
export const SKIN_SCOPE = '[data-brand-skin]'

export function skinCss(theme: ThemeTokens | null, scope: string = SKIN_SCOPE): string {
  if (!theme) return ''

  const vars = brandSkinVars([theme.primary, theme.accent])
  const body = Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(';')

  /**
   * An attribute selector outranks the bare `:root` that `tokens.css` writes
   * these on (0,1,0 against 0,0,1), so the element carrying the attribute and
   * everything inside it inherits the brand while the rest of the document keeps
   * Sahoda's. No `!important`, and the winner does not depend on where a build
   * happens to put a stylesheet.
   */
  return `${scope}{${body}}`
}

/**
 * Every value that reaches the page, for a guard to check.
 *
 * Exported so a test can assert what is emitted without parsing CSS with a
 * regular expression, and so the "seven and no more" rule is checkable rather
 * than merely stated.
 */
export function skinVarNames(theme: ThemeTokens | null): string[] {
  if (!theme) return []
  return Object.keys(brandSkinVars([theme.primary, theme.accent]))
}

/**
 * Does this CSS repaint the whole document?
 *
 * A guard, exported because the ruling it enforces is one character away from
 * being lost: `:root` in place of the attribute is a valid selector, compiles,
 * renders, and silently puts the customer's logo colour back on every button in
 * the product. Naming the failure gives a test something to assert that a
 * string comparison against the whole rule would not survive a token change.
 */
export function skinIsGlobal(css: string): boolean {
  return css.startsWith(':root') || css.startsWith('html') || css.startsWith('*')
}
