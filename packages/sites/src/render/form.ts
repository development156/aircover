import type { RenderContext } from './context'
import { escapeAttr, escapeHtml, safeUrl } from './escape'

/**
 * The four fields the lead route accepts. `leads` has no INSERT policy, so wt-web's route
 * inserts with the service role and MUST derive workspace_id from the site row via the
 * request Host/slug — never from this payload (design §8).
 */
export const LEAD_FORM_FIELDS = ['name', 'email', 'phone', 'message'] as const
export type LeadFormFieldName = (typeof LEAD_FORM_FIELDS)[number]

interface LeadFormFieldSpec {
  label: string
  type: string
  required: boolean
  multiline: boolean
}

const FIELD_SPECS: Record<LeadFormFieldName, LeadFormFieldSpec> = {
  name: { label: 'Name', type: 'text', required: true, multiline: false },
  email: { label: 'Email', type: 'email', required: true, multiline: false },
  phone: { label: 'Phone', type: 'tel', required: false, multiline: false },
  message: { label: 'Message', type: 'text', required: false, multiline: true },
}

const DEFAULT_SUBMIT_LABEL = 'Send enquiry'
const MESSAGE_ROWS = 4

/**
 * Browser-side cap on every control. This is a courtesy bound, NOT a validation boundary:
 * `maxlength` is trivially bypassed by a scripted POST, so the lead route must re-check the
 * same limit server-side and tell the caller when it truncates. Pinned by test — silently
 * shrinking it would cut a visitor's message off mid-sentence with nothing to notice.
 */
const MAX_FIELD_LENGTH = 2000

const renderField = (name: LeadFormFieldName, spec: LeadFormFieldSpec): string => {
  const required = spec.required ? ' required' : ''
  const control = spec.multiline
    ? `<textarea name="${escapeAttr(name)}" rows="${MESSAGE_ROWS}" maxlength="${MAX_FIELD_LENGTH}"${required}></textarea>`
    : `<input type="${escapeAttr(spec.type)}" name="${escapeAttr(name)}" maxlength="${MAX_FIELD_LENGTH}"${required}>`
  return `<label class="field"><span>${escapeHtml(spec.label)}</span>${control}</label>`
}

/**
 * A form action that a POST can actually be delivered to: an absolute `http:`/`https:` URL
 * with an authority, case-insensitive on the scheme.
 *
 * Requiring the `//` is not pedantry. `https:`, `https:api/leads` and `http:/api/leads` all
 * carry an allowed scheme yet resolve *relative to the current document*, so they destroy a
 * lead exactly like a bare fragment does.
 */
const ABSOLUTE_HTTP_ACTION = /^https?:\/\//i

/**
 * The endpoint a lead can actually reach, or `null` if there is no such endpoint.
 *
 * `safeUrl` runs first and is kept for the checks a form action shares with an `href`: it
 * trims, rejects `''`/whitespace-only and over-long values, strips nothing (whitespace and
 * invisible characters are grounds for rejection, not repair), and rejects protocol-relative
 * `//evil.com` and its backslash variants, which would post every lead off-origin while
 * reading like an internal path.
 *
 * But `safeUrl` is an **`href` validator**, and a form action is not a link. Its allowlist is
 * `http|https|mailto|tel` (escape.ts) because all four are legitimate destinations for a
 * *click*. Only the first two are destinations for a `method="post"`: a POST to `tel:` cannot
 * deliver anything at all, and `mailto:` at best opens a mail client with an empty body. Both
 * are the same lead-destroyed-behind-a-success-shaped-UI failure as `#`, so a form action gets
 * its own scheme policy rather than inheriting one written for a different element.
 *
 * The policy is deny-by-default and has exactly two accepting shapes:
 *   - site-relative, starting with a single `/` (`/api/leads`) — `safeUrl` has already ruled
 *     out `//` and `/\`, so a leading `/` here cannot be an authority;
 *   - absolute `http:`/`https:` with an authority (see {@link ABSOLUTE_HTTP_ACTION}).
 * Everything else is rejected, which folds in the bare fragment (`#`, `#contact` — schemeless
 * and not `/`-leading), bare and dot-relative paths (`api/leads`, `./x`, `../x`), and every
 * scheme that is not http(s), whatever its case.
 */
const resolveFormAction = (raw: string | null): string | null => {
  const url = safeUrl(raw)
  if (url === null) return null
  if (url.startsWith('/') || ABSOLUTE_HTTP_ACTION.test(url)) return url
  return null
}

/**
 * A plain HTML POST — no fetch, no inline handler, nothing to XSS. Returns '' when there is no
 * endpoint a lead can actually reach: a form that silently discards submissions is a fake
 * state, so omission is the only honest fallback. Never emits an actionless form, nor one
 * whose action cannot receive a POST — `action=""`, `action="#"`, `action="mailto:…"`,
 * `action="tel:…"` all look like they work and drop the lead on the floor.
 *
 * KNOWN GAP (tracked in the plan, Task 11 ruling 3): the return type is `string`, so a
 * *configured but unusable* `formAction` is discarded with no channel to report it — the
 * caller cannot distinguish it from a deliberate `null`. `src/render/` has no diagnostics
 * vocabulary yet; `normalize/section-content.ts` has `dropped`. Do not paper over this with a
 * placeholder action.
 */
export const renderLeadForm = (submitLabel: string, ctx: RenderContext): string => {
  const action = resolveFormAction(ctx.formAction)
  if (action === null) return ''

  const trimmedLabel = submitLabel.trim()
  const label = trimmedLabel === '' ? DEFAULT_SUBMIT_LABEL : trimmedLabel
  const fields = LEAD_FORM_FIELDS.map((name) => renderField(name, FIELD_SPECS[name])).join('')

  return [
    `<form class="lead-form" method="post" action="${escapeAttr(action)}">`,
    fields,
    `<button class="cta" type="submit">${escapeHtml(label)}</button>`,
    '</form>',
  ].join('')
}
