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
 */
export function skinCss(theme: ThemeTokens | null): string {
  if (!theme) return ''

  const vars = brandSkinVars([theme.primary, theme.accent])
  const body = Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(';')

  /**
   * `:root:root`, and the repetition is the mechanism rather than a typo.
   *
   * `tokens.css` defines these on a bare `:root`. Matching that exactly would
   * leave the winner to document order, which is a promise about where a build
   * puts a stylesheet rather than about CSS. Repeating the pseudo-class doubles
   * the specificity and settles it, with no `!important` and no class that
   * something else has to remember to add to the element.
   */
  return `:root:root{${body}}`
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
