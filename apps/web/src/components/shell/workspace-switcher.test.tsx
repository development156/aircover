import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { WorkspaceSwitcher } from './workspace-switcher'

/**
 * ── THE MENU MUST OUTLIVE THE SUBMIT ─────────────────────────────────────────
 * MEASURED 2026-09-06 on the wt-core preview (Chromium): choosing a workspace in
 * the switcher did nothing. No POST left the browser and the console read
 * "Form submission canceled because the form is not connected", twice. The
 * submit button carried an onClick that closed the menu; a browser runs the
 * microtask checkpoint (where React commits that close) between the click
 * listeners and the form's activation behaviour, so by the time the form would
 * submit it was no longer in the document. Every workspace switch was a no-op.
 *
 * jsdom cannot show this on its own: `userEvent.click` dispatches from script,
 * the stack never empties, and the submission runs before React's microtask.
 * So the first test plays the browser's order by hand — dispatch the click,
 * suppress the synchronous default action, yield to the microtask queue, and
 * only then ask whether the form is still there to submit.
 */
vi.mock('@/app/actions/workspace', () => ({
  setActiveWorkspace: vi.fn(async () => {}),
}))
vi.mock('@/components/workspace/create-workspace-button', () => ({
  CreateWorkspaceButton: () => <button type="button">Create workspace</button>,
}))

import { setActiveWorkspace } from '@/app/actions/workspace'

const spaces = [
  { id: 'w1', name: 'Chai & Chapters', slug: 'chai', timezone: null },
  { id: 'w2', name: 'My workspace', slug: 'mine', timezone: null },
]

/** The list has no role of its own; its eyebrow is the one stable handle. */
function menu(): HTMLElement | null {
  return screen.queryByText('Workspaces')?.parentElement ?? null
}

beforeEach(() => {
  vi.mocked(setActiveWorkspace).mockClear()
})

describe('choosing a workspace', () => {
  test('the form is still in the document when the browser gets to submit it', async () => {
    render(<WorkspaceSwitcher workspaces={spaces} active={spaces[0]!} />)
    await userEvent.click(screen.getByRole('button', { name: /chai & chapters/i }))
    const choice = screen.getByRole('button', { name: /my workspace/i })
    const form = choice.closest('form')
    expect(form).not.toBeNull()

    // Listeners run, React commits in the microtask checkpoint, THEN the
    // activation behaviour. Hold the synchronous default back so the order
    // matches a real browser rather than jsdom's script-dispatch shortcut.
    document.addEventListener('click', (event) => event.preventDefault(), { once: true })
    choice.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()

    expect(document.contains(form)).toBe(true)

    form!.requestSubmit()
    await waitFor(() => expect(setActiveWorkspace).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(setActiveWorkspace).mock.calls[0]?.[0]
    expect(sent?.get('slug')).toBe('mine')
  })

  test('closes the menu once the switch has been asked for', async () => {
    render(<WorkspaceSwitcher workspaces={spaces} active={spaces[0]!} />)
    await userEvent.click(screen.getByRole('button', { name: /chai & chapters/i }))
    expect(menu()).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /my workspace/i }))
    await waitFor(() => expect(setActiveWorkspace).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(menu()).toBeNull())
  })
})
