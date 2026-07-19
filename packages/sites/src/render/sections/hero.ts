import type { HeroContent } from '../../normalize/section-content'
import type { RenderContext } from '../context'
import { renderCta } from '../cta'
import { escapeHtml } from '../escape'

const SECTION_CLASS = 'section section--hero'

/**
 * The page lead. The headline is the document's only `h1` — every other kind opens at `h2` —
 * so a page whose hero has a blank headline gets no `h1` rather than an empty one.
 *
 * `_ctx` is unused today and stays in the signature so the dispatcher can call all six
 * renderers uniformly; the parameter is what makes that uniformity checked rather than assumed.
 */
export const renderHero = (content: HeroContent, _ctx: RenderContext): string => {
  const headline = content.headline.trim()
  const subhead = content.subhead?.trim() ?? ''
  const parts = [
    headline === '' ? '' : `<h1>${escapeHtml(headline)}</h1>`,
    subhead === '' ? '' : `<p class="lede">${escapeHtml(subhead)}</p>`,
    renderCta(content.ctaLabel, content.ctaHref),
  ].filter((part) => part !== '')

  if (parts.length === 0) return ''

  return `<section class="${SECTION_CLASS}"><div class="wrap">${parts.join('')}</div></section>`
}
