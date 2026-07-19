import { safeUrl } from './escape'
import { renderLink } from './link'

const CTA_CLASS = 'cta'
const CTA_INERT_CLASS = 'cta cta--inert'

/**
 * Shared by hero and offer. A label with no safe href renders as inert text: the copy the
 * model wrote is still readable, but no dead-or-dangerous link ships (design §5 rule 2).
 *
 * This function decides only whether there is a CTA at all and which class it carries —
 * the markup itself comes from {@link renderLink}, which is the package's single
 * link-emitting path. `safeUrl` is called here purely to pick the class; `renderLink`
 * re-derives it, and it is a pure function of its argument, so the two cannot disagree.
 */
export const renderCta = (label: string | undefined, href: string | undefined): string => {
  const text = label?.trim() ?? ''
  if (text === '') return ''

  const className = safeUrl(href) === null ? CTA_INERT_CLASS : CTA_CLASS
  return renderLink(href, text, className)
}
