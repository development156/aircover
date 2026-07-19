import type { FeatureItem, FeaturesContent } from '../../normalize/section-content'
import type { RenderContext } from '../context'
import { escapeHtml } from '../escape'

const SECTION_CLASS = 'section section--features'

const renderItem = (item: FeatureItem): string => {
  const body = item.body?.trim() ?? ''
  const bodyHtml = body === '' ? '' : `<p>${escapeHtml(body)}</p>`
  return `<li><h3>${escapeHtml(item.title.trim())}</h3>${bodyHtml}</li>`
}

/**
 * A benefit list. An item with a blank title is dropped rather than rendered as an empty
 * bullet, and an empty list emits no `ul` at all — an empty list element is announced by a
 * screen reader as "list, 0 items", which is worse than the section simply not having one.
 */
export const renderFeatures = (content: FeaturesContent, _ctx: RenderContext): string => {
  const headline = content.headline?.trim() ?? ''
  const items = content.items.filter((item) => item.title.trim() !== '')

  if (headline === '' && items.length === 0) return ''

  const list = items.length === 0 ? '' : `<ul class="grid">${items.map(renderItem).join('')}</ul>`
  const heading = headline === '' ? '' : `<h2>${escapeHtml(headline)}</h2>`

  return `<section class="${SECTION_CLASS}"><div class="wrap">${heading}${list}</div></section>`
}
