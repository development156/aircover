import type { ThemeTokens } from '@sahoda/shared'

/**
 * Everything a renderer is allowed to know — in a module of its own so that no `sections/*.ts`
 * file ever imports a type from the module that imports its values. Nothing here is read from
 * the environment: `tokensCss` is injected by the caller (this package never touches the
 * filesystem) and `canonicalOrigin` is injected config, so a wrong domain cannot produce a
 * plausible URL from inside the renderer (design §7).
 */
export interface RenderContext {
  siteName: string
  tokensCss: string
  /**
   * The active Brand Skin, or `null` when the workspace has no theme row — the common case,
   * since `workspace_themes` is never seeded. `themeCss` derives the seven themeable vars from
   * a populated value and returns `''` for `null` OR for a theme whose primary fails the strict
   * OKLCH parse, so an unusable theme degrades to the inlined tokens.css defaults rather than
   * emitting a partial or unsafe `:root{}` block.
   */
  theme: ThemeTokens | null
  /**
   * The endpoint the lead form POSTs to. `null` ⇒ the contact section renders without a form.
   *
   * A non-null value does NOT guarantee a form: `renderLeadForm` accepts only a site-relative
   * path (`/api/leads`) or an absolute `http:`/`https:` URL, and takes the same no-form exit
   * for anything else — `''`, `'#contact'`, `'api/leads'`, `'javascript:…'`, `'//evil.com/x'`
   * and, despite being valid `href`s, `'mailto:…'`/`'tel:…'` (a POST cannot be delivered to
   * either). A dead form that discards leads is worse than a missing one, so callers must
   * treat `renderLeadForm`'s `''` as a real outcome, not an impossible one.
   */
  formAction: string | null
  canonicalOrigin: string | null
}
