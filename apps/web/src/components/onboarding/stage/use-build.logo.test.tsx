import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useBuild } from './use-build'
import { DEFAULT_DATA, type OnboardingData } from './store'
import type { DoorOutcome } from './door-outcome'

/**
 * WHAT ONBOARDING DOES WITH THE LOGO FILE.
 *
 * The defect this pins: onboarding used to call `uploadAsset`, which stores a
 * file and does not make it the workspace's logo. `workspaces.logo_asset_id`
 * was therefore only ever written later, by somebody replacing their logo from
 * the topbar. `setBrandLogo` is the one action that writes the pointer, so the
 * first assertion below is about WHICH action is called, not about the outcome
 * it reports: an outcome test passes just as happily against the wrong action.
 *
 * The other three are the promises the failure sentence makes. It says the
 * colours are saved, so the colours have to actually be saved when the logo is
 * lost; it says the file is not here, so it has to be the sentence the reader
 * gets, character for character; and none of it may take the build down, since
 * by that line the brain is built and the credits are spent.
 */

const resolveOnboarding = vi.hoisted(() => vi.fn())
const saveBrandMemory = vi.hoisted(() => vi.fn())
const saveWorkspaceTheme = vi.hoisted(() => vi.fn())
const setBrandLogo = vi.hoisted(() => vi.fn())
const uploadAsset = vi.hoisted(() => vi.fn())

vi.mock('@/app/actions/onboarding-resolve', () => ({ resolveOnboarding }))
vi.mock('@/app/actions/brand-resolve', () => ({ saveBrandMemory }))
vi.mock('@/app/actions/theme', () => ({ saveWorkspaceTheme }))
vi.mock('@/app/actions/brand-logo', () => ({ setBrandLogo }))
vi.mock('@/app/actions/assets', () => ({ uploadAsset }))

/** The sentence onboarding owns. Written out in full, on purpose. */
const LOGO_NOT_KEPT =
  'Sahoda could not keep your logo file. Your colours are saved. Add it again from Assets.'

const PALETTE = ['oklch(0.5 0.2 20)', 'oklch(0.6 0.2 140)']

const NO_DOOR: DoorOutcome = { kind: 'none' }

function logoFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
}

function data(patch: Partial<OnboardingData> = {}): OnboardingData {
  return { ...DEFAULT_DATA, name: 'TRAINX', palette: PALETTE, logoName: 'logo.png', ...patch }
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveOnboarding.mockResolvedValue({ ok: true, kind: 'free', brain: {} })
  saveBrandMemory.mockResolvedValue({ ok: true, version: 1 })
  saveWorkspaceTheme.mockResolvedValue({ ok: true })
  setBrandLogo.mockResolvedValue({ ok: true, adopted: false, converted: false })
})

/**
 * Run the build with a logo picked, then the save. Returns the hook so the
 * note it produced can be read.
 */
async function build(d: OnboardingData = data(), file: File | null = logoFile()) {
  const { result } = renderHook(() =>
    useBuild({
      data: d,
      door: NO_DOOR,
      workspaceName: 'TRAINX',
      reduced: true,
      orb: { current: null },
      onBuilt: () => {},
      onDoorSettled: () => {},
    }),
  )
  if (file) act(() => result.current.takeLogo(file))
  await act(async () => {
    await result.current.start()
  })
  await act(async () => {
    await result.current.finish(() => {})
  })
  return result
}

describe('the logo onboarding keeps', () => {
  test('is set as the workspace logo, not merely uploaded', async () => {
    await build()

    expect(setBrandLogo).toHaveBeenCalledTimes(1)
    // The whole defect in one line: storing the bytes is not setting the logo.
    expect(uploadAsset).not.toHaveBeenCalled()
  })

  /** The title is what the pointer-less fallback reads. It still has to go. */
  test('carries the file and the title Logo', async () => {
    await build()

    const form = setBrandLogo.mock.calls[0]?.[0] as FormData
    expect(form.get('title')).toBe('Logo')
    expect(form.get('file')).toBeInstanceOf(File)
  })

  test('sends nothing when no logo was picked', async () => {
    await build(data({ palette: [], logoName: '' }), null)

    expect(setBrandLogo).not.toHaveBeenCalled()
  })

  test('says nothing when the logo landed', async () => {
    const result = await build()

    expect(result.current.afterBuildNote).toBeNull()
  })
})

describe('when the logo does not land', () => {
  test('returns onboarding’s own sentence, not the action’s', async () => {
    setBrandLogo.mockResolvedValue({ ok: false, message: 'Pick a logo to use.' })

    const result = await build()

    expect(result.current.afterBuildNote).toBe(LOGO_NOT_KEPT)
  })

  test('says the same sentence when the action throws', async () => {
    setBrandLogo.mockRejectedValue(new Error('network died'))

    const result = await build()

    expect(result.current.afterBuildNote).toBe(LOGO_NOT_KEPT)
  })

  /**
   * By this line the brain is built and the credits are spent. A lost file may
   * not cost the customer the expensive half.
   */
  test('does not fail the build', async () => {
    setBrandLogo.mockRejectedValue(new Error('network died'))

    const result = await build()

    expect(result.current.failure).toBeNull()
    expect(saveBrandMemory).toHaveBeenCalledTimes(1)
  })

  /** The sentence promises this. It has to be true. */
  test('saves the colours anyway', async () => {
    setBrandLogo.mockRejectedValue(new Error('network died'))

    await build()

    expect(saveWorkspaceTheme).toHaveBeenCalledWith(PALETTE)
  })
})
