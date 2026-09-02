import { act } from '@testing-library/react'
import { vi } from 'vitest'

import type { TurnstileRenderOptions } from './use-turnstile'

/**
 * Stand-ins for Cloudflare's script, shared by both embed form tests.
 *
 * `useTurnstile` appends a script tag and, once it loads, calls
 * `window.turnstile.render` with callbacks. A test drives the same three
 * things a browser would: the tag's `load` or `error` event, and the
 * callbacks the widget was handed. Nothing here is a test; the `*.test.tsx`
 * files beside it are.
 */

export const SCRIPT_SELECTOR = 'script[src^="https://challenges.cloudflare.com/turnstile/"]'

export function scriptTag(): HTMLScriptElement {
  const tag = document.head.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)
  if (!tag) throw new Error('the Turnstile script was never appended')
  return tag
}

export interface FakeTurnstile {
  /** The options the form handed to `render`. Throws if it never rendered. */
  options: () => TurnstileRenderOptions
  reset: ReturnType<typeof vi.fn>
}

/** Install `window.turnstile` and capture the render options so a test can drive them. */
export function installTurnstile(): FakeTurnstile {
  let captured: TurnstileRenderOptions | null = null
  const reset = vi.fn()
  window.turnstile = {
    render: (_el, options) => {
      captured = options
      return 'widget-1'
    },
    reset,
    remove: vi.fn(),
  }
  return {
    options: () => {
      if (!captured) throw new Error('render was never called')
      return captured
    },
    reset,
  }
}

/**
 * Fire the script tag's `load`, which is what makes the hook call `render`.
 *
 * TOLERATES AN ABSENT TAG ON PURPOSE, and this must not be turned back into a
 * throw. A test that calls `installTurnstile()` before `render` is the REMOUNT
 * case: `window.turnstile` is already there, so the hook renders the widget
 * synchronously and appends no script (`use-turnstile.ts` lines 121-136). That
 * fast path is load-bearing — a tag that already fired `load` never fires it
 * again for a listener attached later, so a hook without it would leave a
 * returning visitor waiting out the 8s timeout into `failed`.
 *
 * It hides nothing: every test that calls this then reads `options()`, which
 * throws `render was never called` if the hook rendered no widget.
 */
export function loadScript(): void {
  const tag = document.head.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)
  if (!tag) return
  act(() => {
    tag.dispatchEvent(new Event('load'))
  })
}

/** Fire the script tag's `error`: an ad blocker or a blocked host. */
export function failScript(): void {
  act(() => {
    scriptTag().dispatchEvent(new Event('error'))
  })
}

/** Undo what a test installed. Call from `afterEach`. */
export function uninstallTurnstile(): void {
  delete window.turnstile
  document.head.querySelectorAll(SCRIPT_SELECTOR).forEach((tag) => tag.remove())
}
