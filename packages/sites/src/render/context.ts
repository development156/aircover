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
   * Deliberately narrowed to `null` for this wave: the `themeCss` stub discards its argument,
   * so a `ThemeTokens | null` field would let a caller build a real theme, render, and get a
   * `live` bundle with the brand skin silently dropped. Typing it `null` means the only way to
   * reach the stub with a real theme is a deliberate widening a reviewer sees.
   * Task 9 HAS landed, as a narrow stub — see `src/theme/css.ts`. Widen this to
   * `ThemeTokens | null` only when Tasks 7 and 8 land and `themeCss` itself widens.
   */
  theme: null
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
