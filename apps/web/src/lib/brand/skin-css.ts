import { brandNeutralVars, brandSkinVars, type SkinSurface } from './brand-theme'
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
 * ── TWELVE VARIABLES, AND THE SEMANTICS ARE STILL NOT AMONG THEM ────────────
 * Design System §2 made seven tokens themeable — `--p --pfg --pstrong --acc
 * --t50 --t100 --t300` — and froze everything else. The founder unfroze the
 * NEUTRALS on 2026-08-30, and only the neutrals: `--canvas --surface
 * --surface-2 --surface-3 --line` now carry the brand hue at a chroma of 0.006,
 * with their lightness copied from `tokens.css` unchanged.
 *
 * SEMANTICS REMAIN FROZEN and that is the half of §2 that was always load
 * bearing: danger stays crimson whatever the brand, because a workspace whose
 * brand is red must not have its delete confirmations blend into its buttons.
 *
 * This paragraph said "seven, and not one more" until the neutrals landed. It
 * is written out rather than edited quietly, because the count is the kind of
 * claim a reader trusts without checking.
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
 * on where a build puts a stylesheet.
 *
 * ── IT READS THE THEME, AND STILL DOES NOT OWN IT ───────────────────────────
 * An earlier version of this paragraph said the rule "says nothing about
 * `data-theme`", and treated that as the separation. It was wrong, and the
 * founder's screenshot is what proved it: a brand derived only for a light
 * surface, applied over the dark theme, produced a near-white card carrying
 * near-white text.
 *
 * Reading the theme is not owning it. The moon and sun remain the only control
 * that decides light against dark; this rule never sets `data-theme` and never
 * defines a neutral. What it does now is answer the brand question SEPARATELY
 * for each surface, which is what "separate them" actually requires.
 */
export const SKIN_SCOPE = ":root[data-brand-skin='on']"

export function skinCss(theme: ThemeTokens | null, scope: string = SKIN_SCOPE): string {
  if (!theme) return ''

  const colors = [theme.primary, theme.accent]

  /**
   * ── TWO RULES, AND THE SECOND ONE IS THE BUG REPORT ─────────────────────────
   * Founder's report with a screenshot: the selected plan card was a near-white
   * fill carrying near-white text, and the day/night toggle looked like it was
   * changing the BRAND rather than the theme.
   *
   * One rule was the whole cause, twice over. The derivation graded everything
   * against white, so the tints came back near-white whatever the theme, and in
   * dark `--ink` is `#ffffff`. And `:root[data-brand-skin='on']` is (0,1,1)
   * while `tokens.css`'s `:root[data-theme='dark']` is ALSO (0,1,1) — a tie,
   * broken by document order, and this style is inlined in the body AFTER the
   * stylesheet. So the light-only brand values beat the dark block outright.
   * That is exactly what "the day/night toggle is getting applied on the Brand
   * Skin" describes, and it was right.
   *
   * The dark rule carries both attributes, so it is (0,2,1): it beats the dark
   * block AND the light brand rule, by SPECIFICITY, with nothing resting on
   * where a build happens to put a stylesheet.
   */
  /**
   * ── AND THE NEUTRALS, WHICH IS §2 UNFROZEN ────────────────────────────────
   * Founder's ruling, 2026-08-30. The seven brand tokens reach under 0.5% of the
   * pixels on any screen and two guards keep them there on purpose, so Brand
   * Skin recoloured one button and its verdict was "a pathetic failed attempt".
   * Correct, and unfixable inside the seven.
   *
   * The five neutrals carry the brand HUE at a chroma of 0.006 with their
   * lightness copied from `tokens.css` unchanged, so the tonal ladder and every
   * contrast pair survive — bounded and measured in `brand-neutrals.test.ts`,
   * worst drift 0.153:1. `tokens.css` aliases `--bg`, `--s1` and `--s2` at
   * `var(--surface)` / `var(--canvas)` / `var(--surface-2)`, so overriding the
   * bases carries the whole ladder with them and nothing downstream changes.
   *
   * SEMANTICS ARE STILL FROZEN, and that half of §2 is the important half: a
   * workspace whose brand is red must not have its delete confirmation blend
   * into its buttons.
   */
  const rule = (selector: string, s: SkinSurface) =>
    `${selector}{${Object.entries({ ...brandSkinVars(colors, s), ...brandNeutralVars(colors, s) })
      .map(([name, value]) => `${name}:${value}`)
      .join(';')}}`

  return `${rule(scope, 'light')}${rule(`${scope}[data-theme='dark']`, 'dark')}`
}

/**
 * Every value that reaches the page, for a guard to check.
 *
 * ── IT MUST REPORT WHAT IS EMITTED, NOT WHAT IT USED TO BE ──────────────────
 * When the neutrals were added to `skinCss` this function was left reporting
 * only `brandSkinVars`, and the whole suite stayed green — including the test
 * named "never DEFINES a neutral", which is the one test that existed to notice
 * exactly this. It passed by not looking, which is the defect class this
 * repository names in its one rule. Caught within the same commit and recorded
 * because a guard that cannot see the change is worse than no guard.
 */
export function skinVarNames(
  theme: ThemeTokens | null,
  surface: SkinSurface = 'light',
): string[] {
  if (!theme) return []

  /**
   * ── PARSED FROM THE CSS, NOT ASKED OF THE FUNCTIONS ───────────────────────
   * This read the two derivation functions and reported their keys. MUTATION
   * PROVED IT HOLLOW: adding `'--danger'` straight into the object literal
   * `skinCss` builds left all 489 tests green, including the one named "never
   * DEFINES a semantic token". The guard was checking two functions while the
   * browser received a third thing.
   *
   * It now reads the rule that is actually emitted, so nothing can reach the
   * page without passing through here. A declaration name is the text before
   * the first colon in each `;`-separated chunk, which is why `--pfg:var(--ink)`
   * reports `--pfg` and not `--ink`: referencing a fixed token is not defining
   * it, and that distinction has its own test.
   */
  const css = skinCss(theme)
  const marker = surface === 'dark' ? `${SKIN_SCOPE}[data-theme='dark']{` : `${SKIN_SCOPE}{`
  const start = css.indexOf(marker)
  if (start < 0) return []

  const body = css.slice(start + marker.length, css.indexOf('}', start))
  return body
    .split(';')
    .map((declaration) => declaration.slice(0, declaration.indexOf(':')).trim())
    .filter((name) => name.startsWith('--'))
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
