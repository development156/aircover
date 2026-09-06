import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { saveState, DEFAULT_DATA } from './store'

/**
 * A RESUMED SESSION READS THE WEBSITE IT WAS GIVEN.
 *
 * MEASURED 2026-09-07 on the wt-core preview: save & exit at step 5, return,
 * `data-onb-door="none"`, press Build — the site typed on step 01 was never
 * opened, and the result card would show no verdict about it. The read only
 * ever started on the way OUT of step 01, and the outcome is not persisted.
 *
 * Same harness as `onboarding-stage.focus.test.tsx`: the real stage, with the
 * network and media boundaries stubbed.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/app/actions/onboarding-defer', () => ({
  deferOnboarding: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/app/actions/onboarding-resolve', () => ({ resolveOnboarding: vi.fn() }))
vi.mock('@/app/actions/brand-resolve', () => ({ saveBrandMemory: vi.fn() }))
vi.mock('@/app/actions/theme', () => ({ saveWorkspaceTheme: vi.fn() }))
vi.mock('@/app/actions/boot-video', () => ({ markBootVideoSeen: vi.fn() }))
const readSite = vi.fn().mockResolvedValue({ kind: 'unread', message: '' })
vi.mock('./read-site', () => ({ readSite: (...args: unknown[]) => readSite(...args) }))

vi.stubGlobal(
  'matchMedia',
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })),
)

const { OnboardingStage } = await import('./onboarding-stage')

const WS = 'ws_resume_read'

function renderStage() {
  return render(
    <OnboardingStage
      workspaceId={WS}
      workspaceName="Chai & Chapters"
      isFree
      cost={0}
      hasSavedBrain={false}
      hasSeenBootVideo
    />,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  readSite.mockClear()
})

describe('resume → website read', () => {
  test('a session resumed past step 01 starts the site read it never got', async () => {
    saveState(WS, {
      step: 'comp',
      data: { ...DEFAULT_DATA, name: 'Chai & Chapters', site: 'https://example.com' },
    })

    renderStage()

    await screen.findByRole('heading', { name: /understand your market too/i })
    await waitFor(() => expect(readSite).toHaveBeenCalledWith('https://example.com'))
  })

  test('a session resumed ON step 01 does not read yet — leaving the step does', async () => {
    saveState(WS, {
      step: '1',
      data: { ...DEFAULT_DATA, name: 'Chai & Chapters', site: 'https://example.com' },
    })

    renderStage()

    await screen.findByRole('heading', { name: /what.s your brand called/i })
    expect(readSite).not.toHaveBeenCalled()
  })

  test('nothing to read is nothing read', async () => {
    saveState(WS, { step: '3', data: { ...DEFAULT_DATA, name: 'Chai & Chapters' } })

    renderStage()

    await screen.findByRole('heading', { name: /who are you trying to reach/i })
    expect(readSite).not.toHaveBeenCalled()
  })
})
