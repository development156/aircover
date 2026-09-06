import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Q-10 — MEASURED (docs/51_Full_App_Audit_2026-09-05.md): 14 Tabs stay inside
 * the rail before a keyboard user ever reaches `<main>`, with nothing to skip
 * past it.
 *
 * `layout.skin.test.tsx` mocks `Rail` down to `() => null`, which is exactly
 * the blind spot this guard exists to close: with the rail absent, "first
 * focusable element" is true no matter where the link sits, including AFTER
 * a real rail. So this file's `Rail` mock renders an actual focusable link,
 * and the assertion is DOCUMENT ORDER — the skip link has to precede it,
 * not merely exist somewhere on the page.
 */

const activeThemeTokens = vi.hoisted(() => vi.fn())
const activeWorkspaceRead = vi.hoisted(() => vi.fn())

vi.mock('@/lib/brand/read-theme', () => ({ activeThemeTokens }))
vi.mock('@/lib/workspaces', () => ({ activeWorkspaceRead }))
vi.mock('@/lib/onboarding/defer', () => ({ hasDeferredOnboarding: async () => true }))
vi.mock('@/lib/onboarding/read-onboarding-state', () => ({
  onboardingStateRead: async () => ({ status: 'completed' }),
}))
vi.mock('@/lib/onboarding/landing', () => ({ landingDecision: () => ({ kind: 'through' }) }))
vi.mock('@/components/home/first-run', () => ({ FirstRun: () => null }))
vi.mock('@/components/shell/bottom-nav', () => ({ BottomNav: () => null }))
// A REAL focusable, unlike layout.skin.test.tsx's `() => null` — see header.
vi.mock('@/components/shell/rail', () => ({
  Rail: () => (
    <nav aria-label="Primary">
      <a href="/home">Home</a>
    </nav>
  ),
}))
vi.mock('@/components/shell/topbar', () => ({ Topbar: () => null }))
vi.mock('sonner', () => ({ Toaster: () => null }))

async function shell() {
  const { default: AppLayout } = await import('./layout')
  return render(await AppLayout({ children: <p>Page body</p> }))
}

beforeEach(() => {
  vi.clearAllMocks()
  activeWorkspaceRead.mockResolvedValue({ status: 'ok', workspace: { id: 'ws-1' } })
  activeThemeTokens.mockResolvedValue(null)
})

describe('the app shell: skip to content', () => {
  it('is the first focusable element, ahead of the rail', async () => {
    await shell()

    const skip = screen.getByRole('link', { name: 'Skip to content' })
    const railLink = screen.getByRole('link', { name: 'Home' })

    // DOCUMENT_POSITION_FOLLOWING (4): railLink comes AFTER skip.
    // eslint-disable-next-line no-bitwise
    expect(skip.compareDocumentPosition(railLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('targets the main landmark the rest of the app already keys off', async () => {
    await shell()

    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip.getAttribute('href')).toBe('#main')

    const main = document.querySelector('#main')
    expect(main).not.toBeNull()
    // A fragment link only SCROLLS to an unfocusable target — the next Tab
    // would fall back to the rail unless `#main` can actually take focus.
    expect(main?.getAttribute('tabindex')).toBe('-1')
  })

  /**
   * The mutation this guard exists to catch: the link exists SOMEWHERE, just
   * not first. Moving it after `<Rail />` must fail the first test above.
   */
})
