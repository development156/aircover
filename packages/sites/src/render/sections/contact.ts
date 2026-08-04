import type { ContactContent } from '../../normalize/section-content'
import type { RenderContext } from '../context'
import { escapeHtml } from '../escape'
import { renderLeadForm } from '../form'

const SECTION_CLASS = 'section section--contact'
const SECTION_ID = 'contact'

/**
 * The lead capture section, and the only anchor target on the page (`#contact`).
 *
 * ## `withAnchor` — the id is allocated per DOCUMENT, not per section
 *
 * `id="contact"` is a document-unique name, and nothing in normalization stops a generation from
 * putting two contact sections on one page: `[hero, contact, hero, contact]` is ordinary model
 * output. Emitting the id unconditionally made that page invalid HTML AND made the second
 * section unreachable, because every `#contact` link resolves to the FIRST element carrying the
 * id — so the section the extra CTA was written to reach is the one no CTA can reach.
 *
 * So this renderer does not decide whether it owns the anchor; {@link renderBody} does, and
 * hands the answer down. The rule it applies is "the first contact section that actually EMITS
 * markup claims it" — first-in-the-array is not the same thing, because this function returns
 * `''` for a section with neither copy nor a usable endpoint, and awarding the anchor to a
 * section that renders nothing would leave every `#contact` on the page pointing at no element
 * at all. That is the same broken-link failure one level down, so the claim follows the markup.
 *
 * The uniquify-instead alternative (`contact`, `contact-2`, …) was rejected: `#contact` is the
 * only fragment a model ever writes, so `#contact-2` would be an id nothing links to — churn
 * that fixes the validator complaint and leaves the reachability defect exactly where it was.
 *
 * `renderLeadForm` returns `''` whenever there is no endpoint a POST can actually reach —
 * `ctx.formAction` of `null`, but equally a configured-but-unusable one such as `'#'`,
 * `'mailto:…'` or `'api/leads'`. That empty string is a REAL outcome, not an impossible one:
 * the section then renders its copy alone. A form that silently discards a visitor's enquiry
 * is worse than a section that plainly tells them to call, so no placeholder action is
 * substituted and no empty `<form>` shell ships.
 *
 * With neither copy nor a usable endpoint there is nothing to show, and the section is omitted
 * rather than emitting a bare heading-less shell carrying a dangling `id="contact"`.
 */
export const renderContact = (
  content: ContactContent,
  ctx: RenderContext,
  withAnchor: boolean,
): string => {
  const headline = content.headline?.trim() ?? ''
  const body = content.body?.trim() ?? ''
  const form = renderLeadForm(content.submitLabel?.trim() ?? '', ctx)
  const parts = [
    headline === '' ? '' : `<h2>${escapeHtml(headline)}</h2>`,
    body === '' ? '' : `<p>${escapeHtml(body)}</p>`,
    form,
  ].filter((part) => part !== '')

  if (parts.length === 0) return ''

  const anchor = withAnchor ? ` id="${SECTION_ID}"` : ''
  return `<section class="${SECTION_CLASS}"${anchor}><div class="wrap">${parts.join('')}</div></section>`
}
