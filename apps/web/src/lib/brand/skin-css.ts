import { brandSkinVars } from './brand-theme'
import { SKIN_ATTR } from './skin-preference'
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
 * ── THE SCOPE IS A SWITCH, AND THAT TOOK THREE GOES ─────────────────────────
 * Founder's ruling, 2026-08-29: Brand Skin is separate from the platform theme
 * and switches back and forth, "because it will give the user more options if
 * Brand Skin breaks the readability."
 *
 * Attempt one wrote `:root:root` — the whole product repainted from an automatic
 * read of one PNG, with no way out. A grey-and-white logo washed the interface
 * out and nobody could undo it. Attempt two scoped the rule to the logo mark,
 * which is safe and useless: it paints nothing, so there is nothing to switch.
 *
 * This is the third and it is the switch itself. The rule is ALWAYS emitted and
 * applies only while `<html>` carries `data-brand-skin="on"`, which the logo
 * button writes and `ThemeScript` restores before the first paint. Off is the
 * default, so a workspace that never asks keeps Sahoda's measured palette.
 *
 * `:root[data-brand-skin='on']` is 0,1,1 against `tokens.css`'s bare `:root` at
 * 0,0,1, so the brand wins while it is on with no `!important` and no dependence
 * on where a build puts a stylesheet. It says nothing about `data-theme`, which
 * is why light and dark stay entirely the theme toggle's business: the two
 * attributes are answers to two different questions and compose freely.
 */
export const SKIN_SCOPE = ":root[data-brand-skin='on']"

export function skinCss(theme: ThemeTokens | null, scope: string = SKIN_SCOPE): string {
  if (!theme) return ''

  const vars = brandSkinVars([theme.primary, theme.accent])
  const body = Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(';')

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
 * Does this CSS repaint the document with no way to switch it off?
 *
 * The regression is one character away at all times: dropping the attribute
 * leaves `:root`, which is a valid selector that compiles, renders, and silently
 * puts the customer's logo colour on every button in the product with the switch
 * disconnected. That is attempt one, back again, and nothing about the page
 * would look wrong until somebody's brand made it unreadable.
 *
 * So the test is "unconditional", not "global": a rule that paints the whole
 * document is exactly what Brand Skin is FOR, and the thing that makes it safe
 * is that it is gated on an attribute a person controls.
 */
export function skinIsUnconditional(css: string): boolean {
  const selector = css.slice(0, css.indexOf('{'))
  return selector !== '' && !selector.includes(SKIN_ATTR)
}
