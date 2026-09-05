import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CHALLENGE_MISSING_MESSAGE } from './challenge-copy'
import { LeadForm } from './lead-form'
import {
  SCRIPT_SELECTOR,
  failScript,
  installTurnstile,
  loadScript,
  uninstallTurnstile,
} from './turnstile-harness'
import { LOAD_TIMEOUT_MS } from './use-turnstile'

/**
 * The embeddable contact form, driven the way a browser drives it.
 *
 * ── THE TWO DEFECTS THIS PINS ────────────────────────────────────────────────
 * 1. MEASURED 2026-09-02 against the production build: when Cloudflare's widget
 *    could not load, the form rendered no notice, left Send enabled, posted an
 *    empty token and showed "Please check the details and try again" for
 *    details that were right. Now the failed check is its own state, named,
 *    and the button waits for a token.
 * 2. A blank email was posted as `''`, which the schema refused as an invalid
 *    address, so phone-only enquiries never reached the database. A blank
 *    field is now omitted from the body.
 */

const submitButton = () => screen.getByRole('button', { name: 'Send enquiry' })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, message: 'Thanks. They have your details.' }),
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
    render(<LeadForm siteSlug="chai" siteKey="0xKEY" source={null} />)

    failScript()

    expect(screen.getByRole('alert')).toHaveTextContent(CHALLENGE_MISSING_MESSAGE)
    expect(screen.getByRole('alert').textContent?.toLowerCase()).not.toContain('check the details')
    expect(submitButton()).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives up waiting after the load timeout and says the same thing', () => {
    vi.useFakeTimers()
    render(<LeadForm siteSlug="chai" siteKey="0xKEY" source={null} />)

    expect(screen.queryByRole('alert')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 1)
    })
    expect(screen.queryByRole('alert')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByRole('alert')).toHaveTextContent(CHALLENGE_MISSING_MESSAGE)
    expect(submitButton()).toBeDisabled()
  })

  it('treats a widget error as the same failure and swallows it (returns true)', () => {
    const turnstile = installTurnstile()
    render(<LeadForm siteSlug="chai" siteKey="0xKEY" source={null} />)
    loadScript()

    let handled: unknown
    act(() => {
      handled = turnstile.options()['error-callback']?.('110200')
    })

    expect(handled).toBe(true)
    expect(screen.getByRole('alert')).toHaveTextContent(CHALLENGE_MISSING_MESSAGE)
    expect(submitButton()).toBeDisabled()
  })
})

describe('when the bot check passes', () => {
  it('holds Send until the token arrives, then posts it', async () => {
    const turnstile = installTurnstile()
    render(<LeadForm siteSlug="chai" siteKey="0xKEY" source="/contact" />)
    loadScript()

    expect(submitButton()).toBeDisabled()
    act(() => {
      turnstile.options().callback('tok_123')
    })
    expect(submitButton()).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Asha' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+91 98765 43210' } })
    await act(async () => {
      fireEvent.submit(submitButton().closest('form') as HTMLFormElement)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    const posted = JSON.parse(init.body) as Record<string, unknown>
    expect(posted.turnstile_token).toBe('tok_123')
    expect(posted.site_slug).toBe('chai')
    expect(posted.phone).toBe('+91 98765 43210')
    expect(posted.name).toBe('Asha')
    // THE PHONE-ONLY DEFECT: a blank email must be absent, not `''`.
    expect(posted).not.toHaveProperty('email')
    expect(posted).not.toHaveProperty('message')
    // The honeypot is the one blank that MUST travel, as `''`.
    expect(posted.website).toBe('')
    expect(await screen.findByRole('status')).toHaveTextContent('Thanks. They have your details.')
  })

  it('resets the widget after a refused send, because a token is single-use', async () => {
    const turnstile = installTurnstile()
    fetchMock.mockImplementation(async () => ({
      ok: false,
      json: async () => ({
        ok: false,
        error: 'unavailable',
        message: 'We could not send that just now. Nothing was saved.',
      }),
    }))
    render(<LeadForm siteSlug="chai" siteKey="0xKEY" source={null} />)
    loadScript()
    act(() => {
      turnstile.options().callback('tok_123')
    })

    await act(async () => {
      fireEvent.submit(submitButton().closest('form') as HTMLFormElement)
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved')
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1')
    expect(submitButton()).toBeDisabled()
  })
})

describe('without a site key', () => {
  it('says the form is not set up, loads nothing, and disables Send', () => {
    render(<LeadForm siteSlug="chai" siteKey={null} source={null} />)

    expect(document.head.querySelector(SCRIPT_SELECTOR)).toBeNull()
    expect(screen.getByText(/not finished being set up/)).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })
})
