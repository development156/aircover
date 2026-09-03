'use client'

import { useState } from 'react'

import { CHALLENGE_MISSING_MESSAGE } from './challenge-copy'
import { useTurnstile } from './use-turnstile'

/**
 * The embeddable beta form (doc 13 §5).
 *
 * Four fields exactly — name, business, email, phone — one screen, a verb-first
 * submit, and a success state that is one sentence with no redirect. This runs
 * inside somebody else's landing page, so every string here is plain English
 * and nothing links away.
 *
 * `website` is the honeypot. It is named innocuously, hidden from sight AND from
 * assistive technology, and excluded from tab order — a real person can neither
 * see it nor reach it, so anything in it came from a script.
 *
 * WITHOUT A SITE KEY THE FORM DOES NOT PRETEND. The submit is disabled and says
 * why, because the endpoint fails closed on a missing captcha and a form that
 * submits into a guaranteed rejection is a control that does nothing.
 *
 * AND WHEN THE CHECK CANNOT LOAD IT SAYS THAT, NOT "CHECK THE DETAILS". MEASURED
 * 2026-09-02 in a browser: with Cloudflare's widget blocked this form rendered
 * no notice, left the button enabled, posted an empty token and the visitor was
 * told to re-check details that were right. `useTurnstile` names every way the
 * widget can fail; here that is one sentence and a button that waits for a token.
 *
 * Every field here is required, so a blank one is posted as it is and the
 * endpoint names it. Only the contact form has optional fields to omit.
 */

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; message: string }
  | { kind: 'error'; message: string }

// The kit's `.sl-input` / `.sl-label`, hand-written rather than imported:
// this form is rendered inside a third-party page as an embed, so it must not
// grow a dependency on the app's component tree.
//
// 16px on the input is NOT a slip and must not be "corrected" to the kit's
// 13px: iOS Safari zooms the viewport on focus for any font-size below 16px,
// and this form is an embed on someone else's mobile page where that zoom
// cannot be undone. The label carries the density instead.
// SPECIFICATION.md §10: 44px of target on a phone. This is a PUBLIC lead form
// embedded on a marketing page, so the phone is where most of it is filled in —
// the one screen in the product where the mobile target matters most. The 16px
// text size is already deliberate (anything smaller makes iOS Safari zoom on
// focus); this adds the height to match.
const FIELD =
  'h-input max-narrow:min-h-[44px] w-full rounded-sm bg-surface px-[11px] text-[16px] text-ink shadow-[inset_0_0_0_1px_var(--line)] transition-micro focus-visible:shadow-[inset_0_0_0_1px_var(--brand),0_0_0_3px_var(--t50)] focus-visible:outline-none aria-invalid:shadow-[inset_0_0_0_1.5px_var(--danger)]'

const LABEL = 'mb-[6px] block text-[12px] font-[550] text-muted'

export function BetaForm({ siteKey, source }: { siteKey: string | null; source: string | null }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [invalid, setInvalid] = useState<string[]>([])
  const challenge = useTurnstile(siteKey)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The button is disabled until a token is held, but a form can be submitted
    // by other means, and an empty token is a guaranteed refusal.
    if (challenge.state !== 'ready') return
    const form = event.currentTarget
    const data = new FormData(form)

    setStatus({ kind: 'sending' })
    setInvalid([])

    try {
      const response = await fetch('/api/public/beta-apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') ?? ''),
          business_name: String(data.get('business_name') ?? ''),
          email: String(data.get('email') ?? ''),
          phone: String(data.get('phone') ?? ''),
          // The honeypot travels as `''` on purpose: the schema wants it present
          // and empty, and a bot is what fills it.
          website: String(data.get('website') ?? ''),
          source_url: source ?? undefined,
          turnstile_token: challenge.token,
        }),
      })

      const body = (await response.json()) as {
        ok?: boolean
        message?: string
        fields?: string[]
      }

      if (response.ok && body.ok) {
        setStatus({ kind: 'sent', message: body.message ?? 'Thanks. We have your details.' })
        form.reset()
        return
      }

      setInvalid(body.fields ?? [])
      setStatus({
        kind: 'error',
        message: body.message ?? 'We could not send that just now. Nothing was saved.',
      })
    } catch {
      // A network failure is ours to own, and it genuinely did not save.
      setStatus({
        kind: 'error',
        message: 'We could not send that just now. Nothing was saved. Please try again.',
      })
    }
    // A token is single-use at Cloudflare. Whatever refused the send, the next
    // attempt needs a fresh one, and the button stays disabled until it arrives.
    challenge.reset()
  }

  if (status.kind === 'sent') {
    return (
      <div role="status" className="surface-ring rounded-card bg-surface p-4">
        <p className="text-[15px] text-ink">{status.message}</p>
      </div>
    )
  }

  const sending = status.kind === 'sending'

  // One notice at a time. A check that cannot load outranks a refused send:
  // nothing more can be sent until it loads, whatever the last answer was.
  const notice =
    challenge.state === 'failed'
      ? CHALLENGE_MISSING_MESSAGE
      : status.kind === 'error'
        ? status.message
        : null

  return (
    <form onSubmit={submit} noValidate className="surface-ring rounded-card bg-surface p-4">
      <div className="grid gap-3">
        <div>
          <label className={LABEL} htmlFor="beta-name">
            Your name
          </label>
          <input
            id="beta-name"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            aria-invalid={invalid.includes('name') || undefined}
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="beta-business">
            Business name
          </label>
          <input
            id="beta-business"
            name="business_name"
            required
            maxLength={160}
            autoComplete="organization"
            aria-invalid={invalid.includes('business_name') || undefined}
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="beta-email">
            Email
          </label>
          <input
            id="beta-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            aria-invalid={invalid.includes('email') || undefined}
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="beta-phone">
            Phone
          </label>
          <input
            id="beta-phone"
            name="phone"
            type="tel"
            required
            maxLength={20}
            autoComplete="tel"
            aria-invalid={invalid.includes('phone') || undefined}
            className={FIELD}
          />
        </div>
      </div>

      {/* Honeypot. Hidden from sight, from assistive tech and from tab order. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="beta-website">Website</label>
        <input id="beta-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {siteKey ? (
        // Turnstile renders into this box explicitly (see the hook), so the
        // widget's own failure callbacks reach the form instead of the console.
        <div ref={challenge.containerRef} className="mt-4" />
      ) : (
        <p className="mt-4 rounded-input bg-warn-bg px-3 py-2 text-[13px] text-warn">
          This form is not finished being set up yet, so it cannot take submissions.
        </p>
      )}

      {notice ? (
        <p
          role="alert"
          className="mt-3 rounded-input bg-danger-bg px-3 py-2 text-[13px] text-danger"
        >
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={sending || challenge.state !== 'ready'}
        className="mt-4 h-10 w-full rounded-sm bg-primary text-[14px] leading-none font-[550] text-primary-foreground transition-micro hover:bg-ink dark:hover:bg-white dark:hover:text-[var(--canvas)] active:translate-y-[0.5px] disabled:pointer-events-none disabled:bg-line disabled:text-white"
      >
        {sending ? 'Sending…' : 'Request early access'}
      </button>
    </form>
  )
}
