/**
 * Brand Skin is a SWITCH, and it is not the theme switch.
 *
 * ── THE RULING, AND THE TWO WRONG ANSWERS BEFORE IT ─────────────────────────
 * Founder's ruling, 2026-08-29: "I want Brand Skin separate from platform theme
 * and it can be switched back and forth between Brand Skin and Sahoda themes.
 * It will give the user more options if Brand Skin breaks the readability."
 *
 * Two shipped attempts got this wrong in opposite directions on the same day.
 * The first painted the whole product from an automatic read of the logo, with
 * no way out: a grey-and-white logo washed the interface out and nobody could
 * undo it. The second confined the brand to the logo mark, which is safe and
 * useless, because then it paints nothing and there is nothing to switch.
 *
 * The answer is both: the brand paints the product, and the person decides
 * whether it does. An automatic colour read is a guess about somebody's brand,
 * and a guess needs an off switch rather than a better algorithm.
 *
 * ── TWO SWITCHES THAT MUST NOT TOUCH EACH OTHER ─────────────────────────────
 *
 *   moon / sun   Sahoda's platform theme.   light <-> dark.   NEVER the brand.
 *   the logo     Brand Skin.                on   <-> off.     NEVER light/dark.
 *
 * They COMPOSE. Brand Skin on with dark chosen is the customer's brand colours
 * over Sahoda's dark neutrals, because only seven tokens are themeable and every
 * neutral and semantic belongs to the theme (Design System §2). That is why the
 * two switches can be independent at all: they are not two answers to one
 * question, they are answers to two.
 *
 * ── WHY THE DEFAULT IS OFF ──────────────────────────────────────────────────
 * A workspace that has never touched this gets Sahoda's designed palette, whose
 * contrast steps were measured. Repainting a product from a colour histogram is
 * a thing to be asked for, not a thing to be defaulted into: the failure mode is
 * an interface somebody cannot read, arriving unannounced. One press turns it on
 * and the logo mark is where the press lives.
 *
 * ── AND WHY IT LIVES IN THE BROWSER ─────────────────────────────────────────
 * Same storage as the theme, for the same reason: this is a preference about how
 * one person wants to look at the product, not a fact about the workspace. Two
 * people sharing a workspace can disagree about it, and neither is wrong. It
 * also means the switch is instant, with no round trip and no revalidation.
 *
 * `ThemeScript` reads this key before the first paint, so the attribute is on
 * the document before anything renders and there is no flash of the wrong brand.
 */

/** The localStorage key. Duplicated in `ThemeScript`'s inline source by necessity. */
export const SKIN_KEY = 'sahoda-skin'

/** The attribute on <html>. Duplicated in `ThemeScript` and in `skinCss`'s scope. */
export const SKIN_ATTR = 'data-brand-skin'

export type SkinState = 'on' | 'off'

/**
 * What a stored value means.
 *
 * Anything that is not exactly `on` is off, including null, an empty string and
 * whatever a previous version of this feature might have written. The safe state
 * is the one that keeps the product readable, so it is also the state every
 * unrecognised value falls into.
 */
export function skinStateFromStored(stored: string | null | undefined): SkinState {
  return stored === 'on' ? 'on' : 'off'
}

/** The other one. A switch with two positions, said once. */
export function nextSkinState(current: SkinState): SkinState {
  return current === 'on' ? 'off' : 'on'
}

/**
 * What the button says, which is the destination and not the current state.
 *
 * The same choice `ThemeToggle` makes for its moon and sun, and for the same
 * reason: a control whose label names where it goes is pressable without first
 * working out where you are.
 */
export function skinToggleLabel(current: SkinState): string {
  return current === 'on' ? 'Switch to Sahoda colours' : 'Switch to your brand colours'
}
