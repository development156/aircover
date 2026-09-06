import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Q-03 — MEASURED (docs/51_Full_App_Audit_2026-09-05.md): after Continue,
 * `document.activeElement` was `<body>`. This renders the real stage — not a
 * hook in isolation — because `layout.skin.test.tsx` already recorded the
 * failure mode of the alternative: "three times in this session a correct
 * helper was proven by a passing test while nothing asserted that the screen
 * called it."
 *
 * Everything mocked below is a network or media boundary this flow does not
 * need to cross to reach step 01 and step 02: no resolve, no site read, no
 * boot film. Nothing about focus depends on any of them.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/app/actions/onboarding-defer', () => ({
  deferOnboarding: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/app/actions/onboarding-resolve', () => ({ resolveOnboarding: vi.fn() }))
vi.mock('@/app/actions/brand-resolve', () => ({ saveBrandMemory: vi.fn() }))
vi.mock('@/app/actions/theme', () => ({ saveWorkspaceTheme: vi.fn() }))
vi.mock('@/app/actions/boot-video', () => ({ markBootVideoSeen: vi.fn() }))
vi.mock('./read-site', () => ({
  readSite: vi.fn().mockResolvedValue({ kind: 'unread', message: '' }),
}))

// jsdom has no matchMedia; onboarding-stage.tsx reads it on mount to decide
// reduced motion. Same stub `spend-card.test.tsx` uses.
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

function renderStage() {
  return render(
    <OnboardingStage
      workspaceId="ws_focus"
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
})

describe('onboarding step changes move focus to the new heading', () => {
  test('leaving intro focuses step 01’s own h2, with tabindex -1', async () => {
    const user = userEvent.setup()
    renderStage()

    await user.click(screen.getByRole('button', { name: 'Build my Brand Brain' }))

    const heading = screen.getByRole('heading', { name: 'What’s your brand called?' })
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })

  test('advancing to step 02 moves focus off step 01’s heading and onto its own', async () => {
    const user = userEvent.setup()
    renderStage()

    await user.click(screen.getByRole('button', { name: 'Build my Brand Brain' }))
    // Step 01 gates Continue on a brand name (`canAdvance`, store.ts) — an
    // empty name leaves the button disabled and the click below a no-op.
    await user.type(screen.getByLabelText('Brand name'), 'Chai & Chapters')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const nextHeading = screen.getByRole('heading', { name: 'What does your brand actually do?' })
    expect(document.activeElement).toBe(nextHeading)
    // The previous step's heading is gone from the DOM entirely (the section
    // remounts by key), which is the strongest form of "focus moved off it".
    expect(screen.queryByRole('heading', { name: 'What’s your brand called?' })).toBeNull()
  })

  /**
   * The one case this hook deliberately leaves alone: intro has no `h2` (it
   * is an `h1`), so the very first paint is not focus-hijacked before anyone
   * has pressed anything.
   */
  test('the very first paint, on intro, is left where the browser put it', () => {
    renderStage()
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { level: 1 }))
  })
})
