/**
 * Theme CSS emission — STUB. THIS FILE IS TASK 9'S DELIVERABLE, deliberately partial.
 *
 * Task 9 as planned declares `BRAND_VAR_NAMES`, `brandSkinVars`, a `themeCss` taking
 * `ThemeTokens | null`, and an output-side validation gate. NONE of that is implemented here,
 * because the real derivation consumes Task 7 (oklch parse/format) and Task 8 (readability
 * guard), neither of which has landed. Every generated site therefore renders in the default
 * token palette from packages/shared/tokens.css. The deviation is recorded in
 * docs/superpowers/plans/2026-07-19-sites-v0.md § "Task 9" → "Deviations".
 *
 * Two INDEPENDENT guards stop this stub silently discarding a workspace's brand skin:
 *
 *  1. TYPE — the parameter is narrowed to `null`, not `ThemeTokens | null`, so handing this
 *     function a populated theme is a compile error. Pinned in `css.test.ts`. That pin is
 *     enforced ONLY by `tsc --noEmit` (`pnpm --filter @sahoda/sites typecheck`, a required
 *     gate): vitest strips types and would stay green through any widening. Do not read a
 *     green `vitest run` as evidence that this narrowing still holds.
 *  2. RUNTIME — a non-null argument throws. If the type is ever widened, or bypassed with a
 *     cast, the call fails loudly instead of returning `''`. Returning `''` for a populated
 *     theme would be mock-success: reporting a rendered site while dropping the brand it was
 *     asked to render. This guard is what makes the safety property survive a type change.
 *
 * To widen: implement BRAND_VAR_NAMES / brandSkinVars / the output-side validation gate, and
 * delete the runtime guard in the SAME change. Only then relax the parameter type.
 */
export const themeCss = (tokens: null): string => {
  if (tokens !== null) {
    throw new Error(
      'themeCss: brand-skin derivation is unimplemented (Task 9 stub). Refusing to return CSS ' +
        'for a populated ThemeTokens — that would silently discard the workspace brand skin.',
    )
  }

  return ''
}
