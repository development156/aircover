import type { TestimonialItem, TestimonialsContent } from '../../normalize/section-content'
import type { RenderContext } from '../context'
import { escapeHtml } from '../escape'

const SECTION_CLASS = 'section section--testimonials'

/**
 * Between the two halves of an attribution — "Priya, Patient" — and nowhere else.
 *
 * This used to be `.role::before{content:", "}` in the stylesheet. CSS cannot see whether an
 * author is present, so the comma was emitted for a role-only attribution too, rendering the
 * orphan ", Cafe owner". That shape is ordinary model output, not a hand-built draft: a model
 * writing `name` instead of `author` has the key dropped (honestly, into `dropped`) and leaves
 * exactly a role with no author. Splitting a conditional across two languages, with the
 * condition knowable in only one of them, is what made it unfixable in place — so the whole
 * decision now lives here, and the sheet styles `.role` without writing into it.
 *
 * A package constant, never model output, so it needs no escaping.
 */
const ATTRIBUTION_SEPARATOR = ', '

const renderItem = (item: TestimonialItem): string => {
  const author = item.author?.trim() ?? ''
  const role = item.role?.trim() ?? ''
  // Filtered before joining, so the separator appears only BETWEEN two present values: an
  // author alone renders bare, a role alone renders with no leading comma, and neither renders
  // no figcaption at all rather than an empty element.
  const attribution = [
    author === '' ? '' : escapeHtml(author),
    role === '' ? '' : `<span class="role">${escapeHtml(role)}</span>`,
  ].filter((part) => part !== '')
  const caption =
    attribution.length === 0
      ? ''
      : `<figcaption>${attribution.join(ATTRIBUTION_SEPARATOR)}</figcaption>`
  return `<li><figure><blockquote><p>${escapeHtml(item.quote.trim())}</p></blockquote>${caption}</figure></li>`
}

/**
 * Social proof. An entry with a blank quote is dropped whatever its attribution says: a name
 * and a job title with no words attached is not a testimonial, and rendering one would put a
 * real person's name behind an endorsement they are not shown making.
 */
export const renderTestimonials = (content: TestimonialsContent, _ctx: RenderContext): string => {
  const headline = content.headline?.trim() ?? ''
  const items = content.items.filter((item) => item.quote.trim() !== '')

  if (headline === '' && items.length === 0) return ''

  const list = items.length === 0 ? '' : `<ul class="grid">${items.map(renderItem).join('')}</ul>`
  const heading = headline === '' ? '' : `<h2>${escapeHtml(headline)}</h2>`

  return `<section class="${SECTION_CLASS}"><div class="wrap">${heading}${list}</div></section>`
}
