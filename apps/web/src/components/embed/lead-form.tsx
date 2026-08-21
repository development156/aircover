'use client'

import { useEffect, useState } from 'react'

/**
 * THE EMBEDDABLE CONTACT FORM — door one into `leads`, reachable today.
 *
 * ── WHY AN EMBED AND NOT THE GENERATED SITE'S OWN FORM ───────────────────────
 * `packages/sites` can already render a contact form: `renderLeadForm` takes a
 * `formAction` and emits a plain HTML POST. Two things stop that being the door
 * that opens first, and neither is a shortcut being taken here:
 *
 *   1. Sites v0 GENERATES AND PREVIEWS AND DOES NOT DEPLOY. There is no address
 *      a member of the public can reach, so no form on a generated site can be
 *      submitted by anybody at all.
 *   2. A plain HTML POST cannot carry a captcha token. `lead_submit` writes with
 *      the service role, and an uncaptcha'd service-role insert is an open public
 *      endpoint — the exact thing 20260727072107 ruled out by name. So the
 *      generated form stays formless until the document can carry a Turnstile
 *      widget, which is a `packages/sites` change with its own CSP decision.
 *
 * This form has neither problem. It is framed into whatever site the shop
 * already has — the same shape `/embed/beta` already ships — it runs JavaScript,
 * so it carries a real token, and it needs nothing deployed.
 *
 * WITHOUT A SITE KEY IT DOES NOT PRETEND. The submit is disabled and says why,
 * because the endpoint fails closed on a missing captcha and a form that submits
 * into a guaranteed rejection is a control that does nothing.
 */

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; message: string }
  | { kind: 'error'; message: string }

// Hand-written rather than imported from the app's component tree: this renders
// inside a third-party page and must not grow a dependency on it.
//
// `type-input-embed` is the 16px step, and it is a step rather than a literal
// for a reason the design lint is right about: `beta-form.tsx` hand-wrote
// `text-[16px]` and carries it as baselined debt, and a second copy is how a
// value drifts. The SIZE itself is a browser constraint — iOS Safari zooms the
// viewport on focus below 16px, and on a page this application does not own
// that zoom cannot be undone. See `--t-input-embed` in tokens.css.
const FIELD =
  'type-input-embed h-input max-narrow:min-h-11 w-full rounded-sm bg-surface px-3 text-ink shadow-[inset_0_0_0_1px_var(--line)] transition-micro focus-visible:shadow-[inset_0_0_0_1px_var(--brand),0_0_0_3px_var(--t50)] focus-visible:outline-none aria-invalid:shadow-[inset_0_0_0_1.5px_var(--danger)]'

// The density lives on the LABEL, which is why the field can afford 16px.
const LABEL = 'type-sm mb-1.5 block font-[550] text-muted'

export interface LeadFormProps {
  /** The site whose workspace this enquiry belongs to. Resolved server-side. */
  siteSlug: string
  siteKey: string | null
  /** The page the visitor was on, read from the request the server saw. */
  source: string | null
}

export function LeadForm({ siteSlug, siteKey, source }: LeadFormProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [invalid, setInvalid] = useState<string[]>([])

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
      const response = await fetch('/api/public/site-lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // The SLUG, never a workspace id. Nothing a visitor can edit decides
          // which shop this enquiry lands in — see the migration header.
          site_slug: siteSlug,
          name: String(data.get('name') ?? ''),
          email: String(data.get('email') ?? ''),
          phone: String(data.get('phone') ?? ''),
          message: String(data.get('message') ?? ''),
          website: String(data.get('website') ?? ''),
          source_url: source ?? undefined,
          turnstile_token: String(data.get('cf-turnstile-response') ?? ''),
        }),
      })

      const body = (await response.json()) as { ok?: boolean; message?: string; fields?: string[] }

      if (response.ok && body.ok) {
        setStatus({ kind: 'sent', message: body.message ?? 'Thanks — they have your details.' })
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
        message: 'We could not send that just now. Nothing was saved — please try again.',
      })
    }
  }

  if (status.kind === 'sent') {
    return (
      <div role="status" className="surface-ring rounded-card bg-surface p-4">
        <p className="type-h3 text-ink">{status.message}</p>
      </div>
    )
  }

  const sending = status.kind === 'sending'

  return (
    <form onSubmit={submit} noValidate className="surface-ring rounded-card bg-surface p-4">
      <div className="grid gap-3">
        <div>
          <label className={LABEL} htmlFor="lead-name">
            Your name
          </label>
          <input
            id="lead-name"
            name="name"
            maxLength={120}
            autoComplete="name"
            aria-invalid={invalid.includes('name') || undefined}
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="lead-email">
            Email
          </label>
          <input
            id="lead-email"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            aria-invalid={invalid.includes('email') || undefined}
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="lead-phone">
            Phone
          </label>
          <input
            id="lead-phone"
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            aria-invalid={invalid.includes('phone') || undefined}
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="lead-message">
            What do you need?
          </label>
          <textarea
            id="lead-message"
            name="message"
            rows={4}
            maxLength={4000}
            aria-invalid={invalid.includes('message') || undefined}
            className={`${FIELD} h-auto py-2`}
          />
        </div>
      </div>

      {/* NEITHER email NOR phone is `required`, and the pair is checked instead.
          A shop's customers leave one or the other; demanding an address from
          somebody who only has a number turns them away. */}
      <p className="type-sm mt-2 text-muted">
        Leave an email address or a phone number so they can reply.
      </p>

      {/* Honeypot. Hidden from sight, from assistive tech and from tab order. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="lead-website">Website</label>
        <input id="lead-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {siteKey ? (
        <div className="cf-turnstile mt-4" data-sitekey={siteKey} data-theme="light" />
      ) : (
        <p className="type-body mt-4 rounded-input bg-warn-bg px-3 py-2 text-warn">
          This form is not finished being set up yet, so it cannot take enquiries.
        </p>
      )}

      {status.kind === 'error' ? (
        <p
          role="alert"
          className="type-body mt-3 rounded-input bg-danger-bg px-3 py-2 text-danger"
        >
          {status.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={sending || !siteKey}
        className="mt-4 h-10 w-full rounded-sm bg-primary type-h3 font-[550] text-primary-foreground transition-micro hover:bg-ink dark:hover:bg-white dark:hover:text-[var(--canvas)] disabled:pointer-events-none disabled:bg-line disabled:text-white"
      >
        {sending ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  )
}
