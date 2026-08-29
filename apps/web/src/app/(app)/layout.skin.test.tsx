import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE WIRE ITSELF.
 *
 * Every part of Brand Skin worked and none of it reached a screen, because the
 * app shell never read the theme. `skin-css.test.ts` proves the CSS is right;
 * this proves the shell asks for it, for the current workspace, and puts it in
 * the page.
 *
 * That distinction is not theoretical. Three times in this session a correct
 * helper was proven by a passing test while nothing asserted that the screen
 * called it, and each time a mutation restored the defect with everything green.
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
vi.mock('@/components/shell/rail', () => ({ Rail: () => null }))
vi.mock('@/components/shell/topbar', () => ({ Topbar: () => null }))
vi.mock('sonner', () => ({ Toaster: () => null }))

const THEME = {
  primary: 'oklch(0.55 0.12 195)',
  primaryFg: 'oklch(1 0 0)',
  secondary: 'oklch(0.2 0 0)',
  accent: 'oklch(0.6 0.14 190)',
  surface: ['oklch(1 0 0)', 'oklch(0.99 0 0)', 'oklch(0.98 0 0)', 'oklch(0.9 0 0)'],
  text: { hi: 'oklch(0.2 0 0)', mid: 'oklch(0.5 0 0)', low: 'oklch(0.7 0 0)' },
  border: 'oklch(0.9 0 0)',
  success: 'oklch(0.6 0.15 145)',
  warning: 'oklch(0.75 0.15 80)',
  danger: 'oklch(0.55 0.2 25)',
  radius: '24px',
  fontHeading: 'Plus Jakarta Sans',
  fontBody: 'Plus Jakarta Sans',
}

async function shell() {
  const { default: AppLayout } = await import('./layout')
  return render(await AppLayout({ children: null }))
}

beforeEach(() => {
  vi.clearAllMocks()
  activeWorkspaceRead.mockResolvedValue({ status: 'ok', workspace: { id: 'ws-1' } })
  activeThemeTokens.mockResolvedValue(THEME)
})

describe('the app shell and Brand Skin', () => {
  it('puts the workspace brand in the page', async () => {
    const { container } = await shell()
    const style = container.querySelector('style[data-brand-skin]')

    expect(style).not.toBeNull()
    expect(style?.textContent ?? '').toContain('--p:')
  })

  /**
   * Server-rendered, not applied by an effect. An effect paints Sahoda orange
   * first and the customer's brand a frame later, which is the flash docs/26
   * forbids. A `<style>` present in the first render is the mechanical form of
   * "no flash".
   */
  it('carries the colours in the first render rather than after one', async () => {
    const { container } = await shell()

    expect(container.querySelector('style[data-brand-skin]')?.textContent).toMatch(/oklch/)
  })

  /**
   * The CURRENT workspace, not the account. RLS confines the read to the
   * caller's memberships, which for somebody in two workspaces is not the same
   * thing: an unfiltered read paints one workspace in the other's brand, which
   * `read-theme.ts` records happening on /sites.
   */
  it('asks for the theme of the workspace being viewed', async () => {
    await shell()

    expect(activeThemeTokens).toHaveBeenCalledWith('ws-1')
  })

  it('paints nothing when the workspace has no theme', async () => {
    activeThemeTokens.mockResolvedValue(null)
    const { container } = await shell()

    expect(container.querySelector('style[data-brand-skin]')).toBeNull()
  })

  /** No workspace is not a reason to ask, and not a reason to fail. */
  it('does not ask for a theme when there is no workspace', async () => {
    activeWorkspaceRead.mockResolvedValue({ status: 'none' })
    const { container } = await shell()

    expect(activeThemeTokens).not.toHaveBeenCalled()
    expect(container.querySelector('style[data-brand-skin]')).toBeNull()
  })

  /**
   * A READ THAT DID NOT ANSWER LOOKS EXACTLY LIKE NO THEME, and that is by
   * construction rather than by hope: `activeThemeTokens` catches its own
   * failures and a malformed row fails its schema parse, so both arrive here as
   * `null` and the case above covers them.
   *
   * There was a test here asserting the shell survives a THROWING read. It
   * passed by asserting `rejects.toThrow()`, which is the opposite of what its
   * name claimed, against a rejection the reader cannot produce. A guard that
   * proves the reverse of its own sentence is worse than no guard, so it is
   * gone rather than weakened.
   */
})
