import type { OfferContent } from '../../normalize/section-content'
import type { RenderContext } from '../context'
import { renderCta } from '../cta'
import { escapeHtml } from '../escape'

const SECTION_CLASS = 'section section--offer'

/**
 * The pitch. The price note is its own paragraph with its own class so the design system can
 * treat it as a number (tabular figures) without the renderer having to guess which paragraph
 * holds a price.
 */
export const renderOffer = (content: OfferContent, _ctx: RenderContext): string => {
  const headline = content.headline.trim()
  const body = content.body?.trim() ?? ''
  const priceNote = content.priceNote?.trim() ?? ''
  const parts = [
    headline === '' ? '' : `<h2>${escapeHtml(headline)}</h2>`,
    body === '' ? '' : `<p>${escapeHtml(body)}</p>`,
    priceNote === '' ? '' : `<p class="price">${escapeHtml(priceNote)}</p>`,
    renderCta(content.ctaLabel, content.ctaHref),
  ].filter((part) => part !== '')

  if (parts.length === 0) return ''

  return `<section class="${SECTION_CLASS}"><div class="wrap">${parts.join('')}</div></section>`
}
