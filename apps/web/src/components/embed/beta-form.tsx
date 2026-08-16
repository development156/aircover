'use client'

import { useEffect, useRef, useState } from 'react'

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
const FIELD =
  'h-input w-full rounded-sm bg-surface px-[11px] text-[16px] text-ink shadow-[inset_0_0_0_1px_var(--line)] transition-micro focus-visible:shadow-[inset_0_0_0_1px_var(--brand),0_0_0_3px_var(--t50)] focus-visible:outline-none aria-invalid:shadow-[inset_0_0_0_1.5px_var(--danger)]'

const LABEL = 'mb-[6px] block text-[12px] font-[550] text-muted'

export function BetaForm({ siteKey, source }: { siteKey: string | null; source: string | null }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [invalid, setInvalid] = useState<string[]>([])
  const widgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!siteKey) return
    // Cloudflare's script renders any .cf-turnstile it finds and writes the
    // token into a hidden input named cf-turnstile-response.
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
    return () => script.remove()
  }, [siteKey])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
          website: String(data.get('website') ?? ''),
          source_url: source ?? undefined,
          turnstile_token: String(data.get('cf-turnstile-response') ?? ''),
        }),
      })

      const body = (await response.json()) as {
        ok?: boolean
        message?: string
        fields?: string[]
      }

      if (response.ok && body.ok) {
        setStatus({ kind: 'sent', message: body.message ?? 'Thanks — we have your details.' })
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
        message: 'We could not reach us just now. Nothing was saved — please try again.',
      })
    }
  }

  if (status.kind === 'sent') {
    return (
      <div role="status" className="surface-ring rounded-card bg-surface p-4">
        <p className="text-[15px] text-ink">{status.message}</p>
      </div>
    )
  }

  const sending = status.kind === 'sending'

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
        <div
          ref={widgetRef}
          className="cf-turnstile mt-4"
          data-sitekey={siteKey}
          data-theme="light"
        />
      ) : (
        <p className="mt-4 rounded-input bg-warn-bg px-3 py-2 text-[13px] text-warn">
          This form is not finished being set up yet, so it cannot take submissions.
        </p>
      )}

      {status.kind === 'error' ? (
        <p
          role="alert"
          className="mt-3 rounded-input bg-danger-bg px-3 py-2 text-[13px] text-danger"
        >
          {status.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={sending || !siteKey}
        className="mt-4 h-10 w-full rounded-sm bg-primary text-[14px] leading-none font-[550] text-primary-foreground transition-micro hover:bg-ink active:translate-y-[0.5px] disabled:pointer-events-none disabled:bg-line disabled:text-white"
      >
        {sending ? 'Sending…' : 'Request early access'}
      </button>
    </form>
  )
}
