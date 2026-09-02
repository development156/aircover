import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BetaForm } from './beta-form'
import { CHALLENGE_MISSING_MESSAGE } from './challenge-copy'
import {
  SCRIPT_SELECTOR,
  failScript,
  installTurnstile,
  loadScript,
  uninstallTurnstile,
} from './turnstile-harness'
import { LOAD_TIMEOUT_MS } from './use-turnstile'

/**
 * The embeddable early-access form, driven the way a browser drives it.
 *
 * The sibling of `lead-form.test.tsx`, for the sibling defect: MEASURED
 * 2026-09-02 against the production build, both embed forms behaved the same
 * way when Cloudflare's widget could not load (no notice, button enabled, an
 * empty token posted, "check the details" shown for details that were right).
 * A fix that closes one form and leaves the other is the sibling-shape defect
 * this repository keeps finding, so the second form gets the same guard.
 */

const submitButton = () => screen.getByRole('button', { name: 'Request early access' })

function fillEveryField(): void {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Asha Rao' } })
  fireEvent.change(screen.getByLabelText('Business name'), {
    target: { value: 'Chai & Chapters' },
  })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha@example.com' } })
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '9876543210' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, message: 'Thanks. We have your details.' }),
  }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  uninstallTurnstile()
})

describe('when the bot check cannot load', () => {
  it('says so, sends nothing, and never asks the visitor to check their details', () => {
    render(<BetaForm siteKey="0xKEY" source={null} />)

    failScript()

    expect(screen.getByRole('alert')).toHaveTextContent(CHALLENGE_MISSING_MESSAGE)
    expect(screen.getByRole('alert').textContent?.toLowerCase()).not.toContain('check the details')
    expect(submitButton()).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives up waiting after the load timeout and says the same thing', () => {
    vi.useFakeTimers()
    render(<BetaForm siteKey="0xKEY" source={null} />)

    expect(screen.queryByRole('alert')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(LOAD_TIMEOUT_MS)
    })

    expect(screen.getByRole('alert')).toHaveTextContent(CHALLENGE_MISSING_MESSAGE)
    expect(submitButton()).toBeDisabled()
  })

  it('treats a widget error as the same failure and swallows it (returns true)', () => {
    const turnstile = installTurnstile()
    render(<BetaForm siteKey="0xKEY" source={null} />)
    loadScript()

    let handled: unknown
    act(() => {
      handled = turnstile.options()['error-callback']?.('110200')
    })

    expect(handled).toBe(true)
    expect(screen.getByRole('alert')).toHaveTextContent(CHALLENGE_MISSING_MESSAGE)
    expect(submitButton()).toBeDisabled()
  })

  it('does not post even when the form is submitted around the disabled button', async () => {
    render(<BetaForm siteKey="0xKEY" source={null} />)
    failScript()
    fillEveryField()

    await act(async () => {
      fireEvent.submit(submitButton().closest('form') as HTMLFormElement)
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('when the bot check passes', () => {
  it('holds the button until the token arrives, then posts it with every field', async () => {
    const turnstile = installTurnstile()
    render(<BetaForm siteKey="0xKEY" source="/pricing" />)
    loadScript()

    expect(submitButton()).toBeDisabled()
    act(() => {
      turnstile.options().callback('tok_123')
    })
    expect(submitButton()).toBeEnabled()

    fillEveryField()
    await act(async () => {
      fireEvent.submit(submitButton().closest('form') as HTMLFormElement)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('/api/public/beta-apply')
    const posted = JSON.parse(init.body) as Record<string, unknown>
    expect(posted.turnstile_token).toBe('tok_123')
    expect(posted.name).toBe('Asha Rao')
    expect(posted.business_name).toBe('Chai & Chapters')
    expect(posted.email).toBe('asha@example.com')
    expect(posted.phone).toBe('9876543210')
    expect(posted.source_url).toBe('/pricing')
    // The honeypot is the one blank that MUST travel, as `''`.
    expect(posted.website).toBe('')
    expect(await screen.findByRole('status')).toHaveTextContent('Thanks. We have your details.')
  })

  it('resets the widget after a refused send, because a token is single-use', async () => {
    const turnstile = installTurnstile()
    fetchMock.mockImplementation(async () => ({
      ok: false,
      json: async () => ({
        ok: false,
        error: 'invalid',
        fields: ['phone'],
        message: 'Please check the details and try again.',
      }),
    }))
    render(<BetaForm siteKey="0xKEY" source={null} />)
    loadScript()
    act(() => {
      turnstile.options().callback('tok_123')
    })

    await act(async () => {
      fireEvent.submit(submitButton().closest('form') as HTMLFormElement)
    })

    // A refused DETAIL is still told as one; only a missing token gets the
    // challenge sentence.
    expect(screen.getByRole('alert')).toHaveTextContent('Please check the details')
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true')
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1')
    expect(submitButton()).toBeDisabled()
  })
})

describe('without a site key', () => {
  it('says the form is not set up, loads nothing, and disables the button', () => {
    render(<BetaForm siteKey={null} source={null} />)

    expect(document.head.querySelector(SCRIPT_SELECTOR)).toBeNull()
    expect(screen.getByText(/not finished being set up/)).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })
})
