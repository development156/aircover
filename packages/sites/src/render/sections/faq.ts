import type { FaqContent, FaqItem } from '../../normalize/section-content'
import type { RenderContext } from '../context'
import { escapeHtml } from '../escape'

const SECTION_CLASS = 'section section--faq'

const renderItem = (item: FaqItem): string =>
  `<dt>${escapeHtml(item.q.trim())}</dt><dd>${escapeHtml(item.a.trim())}</dd>`

/**
 * Question/answer pairs as a `dl`, so the association is semantic rather than visual.
 *
 * BOTH halves are required. `faqItem` in normalize already drops a pair where either key is
 * missing, but it accepts a whitespace-only string, so the blank check has to exist here too:
 * a visible question under an empty answer reads as a site that is broken, and a visible
 * answer with no question reads as a non sequitur.
 */
export const renderFaq = (content: FaqContent, _ctx: RenderContext): string => {
  const headline = content.headline?.trim() ?? ''
  const items = content.items.filter((item) => item.q.trim() !== '' && item.a.trim() !== '')

  if (headline === '' && items.length === 0) return ''

  const list = items.length === 0 ? '' : `<dl class="faq">${items.map(renderItem).join('')}</dl>`
  const heading = headline === '' ? '' : `<h2>${escapeHtml(headline)}</h2>`

  return `<section class="${SECTION_CLASS}"><div class="wrap">${heading}${list}</div></section>`
}
