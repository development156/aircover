import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useBuild } from './use-build'
import { DEFAULT_DATA, type OnboardingData } from './store'
import type { DoorOutcome } from './door-outcome'

/**
 * THE COLOURS THE BUILD ACTUALLY SAVES.
 *
 * `logo-palette.test.ts` proves the extracted palette can move theme tokens.
 * That is not the same as proving the build SENDS it, and this session has
 * already been bitten twice by exactly that gap: a mutation that made the build
 * ignore `data.palette` and use the website's colours instead left all 232
 * onboarding tests green.
 *
 * So this asserts the wiring: a logo's colours reach `saveWorkspaceTheme`, they
 * beat the website's, and an empty palette falls back rather than saving a theme
 * of nothing.
 */

const resolveOnboarding = vi.hoisted(() => vi.fn())
const saveBrandMemory = vi.hoisted(() => vi.fn())
const saveWorkspaceTheme = vi.hoisted(() => vi.fn())

vi.mock('@/app/actions/onboarding-resolve', () => ({ resolveOnboarding }))
vi.mock('@/app/actions/brand-resolve', () => ({ saveBrandMemory }))
vi.mock('@/app/actions/theme', () => ({ saveWorkspaceTheme }))

const LOGO = ['oklch(0.5 0.2 20)', 'oklch(0.6 0.2 140)']
const SITE = ['oklch(0.3 0.1 200)', 'oklch(0.4 0.1 210)']

/** A door that DID read a website, so there is a rival source of colours. */
const DOOR_WITH_COLORS: DoorOutcome = {
  kind: 'read',
  label: 'trainx.in',
  text: 'x'.repeat(400),
  colors: SITE,
  foundName: 'TRAINX',
} as DoorOutcome

function data(patch: Partial<OnboardingData> = {}): OnboardingData {
  return { ...DEFAULT_DATA, name: 'TRAINX', ...patch }
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveOnboarding.mockResolvedValue({ ok: true, kind: 'free', brain: {} })
  saveBrandMemory.mockResolvedValue({ ok: true, version: 1 })
  saveWorkspaceTheme.mockResolvedValue({ ok: true })
})

async function build(d: OnboardingData, door: DoorOutcome) {
  const { result } = renderHook(() =>
    useBuild({
      data: d,
      door,
      workspaceName: 'TRAINX',
      reduced: true,
      orb: { current: null },
      onBuilt: () => {},
      onDoorSettled: () => {},
    }),
  )
  await act(async () => {
    await result.current.start()
  })
  await act(async () => {
    // `finish` takes a callback, not a destination: it reports whether the save
    // succeeded rather than where to go next.
    await result.current.finish(() => {})
  })
}

describe('the theme the build saves', () => {
  test("uses the logo's colours", async () => {
    await build(data({ palette: LOGO, logoName: 'logo.png' }), DOOR_WITH_COLORS)

    expect(saveWorkspaceTheme).toHaveBeenCalledWith(LOGO)
  })

  /**
   * A file somebody chose is their statement about the brand. A website's
   * colours are a guess from a page that may be mostly stock photography.
   */
  test("prefers the logo over the website's colours", async () => {
    await build(data({ palette: LOGO, logoName: 'logo.png' }), DOOR_WITH_COLORS)

    expect(saveWorkspaceTheme).not.toHaveBeenCalledWith(SITE)
  })

  test('falls back to the website when there is no logo', async () => {
    await build(data({ palette: [] }), DOOR_WITH_COLORS)

    expect(saveWorkspaceTheme).toHaveBeenCalledWith(SITE)
  })

  /** Neither source is not a theme of nothing: it must not save at all. */
  test('saves no theme when there is neither a logo nor a website', async () => {
    await build(data({ palette: [] }), { kind: 'none' })

    expect(saveWorkspaceTheme).not.toHaveBeenCalled()
  })
})
