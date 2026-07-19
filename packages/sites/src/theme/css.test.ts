import { describe, expect, it } from 'vitest'
import type { ThemeTokens } from '@sahoda/shared'
import { themeCss } from './css'

/**
 * TYPE-LEVEL PINS on the narrowed `null` parameter.
 *
 * These are enforced by `tsc --noEmit` (`pnpm --filter @sahoda/sites typecheck`) and by NOTHING
 * ELSE. vitest does not typecheck, so `vitest run` stays green through any widening of
 * `themeCss` — a green test run is not evidence that these hold. `tsconfig.json` has
 * `include: ["src"]`, so this file is typechecked.
 *
 * There is deliberately NO runtime assertion of the shape `expect(themeCss(populated)).toBe('')`
 * here. Such an assertion would encode "a populated theme yields empty CSS" as sanctioned
 * expected behaviour — exactly the silent brand-skin discard the narrow type exists to prevent.
 * The runtime half of that property is asserted below as a throw, not as an empty string.
 */
type Expect<T extends true> = T
type ParameterIsExactlyNull = [Parameters<typeof themeCss>[0]] extends [null] ? true : false

/** Fails with TS2344 the moment the parameter is widened to anything at all, `ThemeTokens | null` included. */
type _ParameterStaysNarrow = Expect<ParameterIsExactlyNull>

/** Fails with TS2578 ("unused '@ts-expect-error'") the moment a populated theme becomes assignable. */
// @ts-expect-error narrow `null` signature: widen only when the real derivation lands.
const _populatedThemeIsRejected: (tokens: ThemeTokens) => string = themeCss

const populatedTheme = {
  primary: 'oklch(0.62 0.14 250)',
  primaryFg: 'oklch(1 0 0)',
  accent: 'oklch(0.55 0.16 30)',
} as unknown as ThemeTokens

describe('themeCss (stub)', () => {
  it('returns an empty string for the no-active-theme path', () => {
    expect(themeCss(null)).toBe('')
  })

  it('throws rather than returning empty CSS when handed a populated theme', () => {
    // The cast is the whole point: it simulates the type guard being widened or bypassed.
    expect(() => themeCss(populatedTheme as never)).toThrow(/unimplemented/i)
  })

  it('names the discarded value in the error, so the failure is diagnosable', () => {
    expect(() => themeCss(populatedTheme as never)).toThrow(/ThemeTokens/)
  })

  it('refuses any non-null argument, not just object-shaped ones', () => {
    for (const bogus of [undefined, 0, '', 'oklch(0.5 0.1 20)', {}]) {
      expect(() => themeCss(bogus as never)).toThrow(/unimplemented/i)
    }
  })
})
