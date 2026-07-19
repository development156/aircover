import type { NormalizedSection } from '../../normalize/section-content'
import type { RenderContext } from '../context'
import { renderHero } from './hero'
import { renderFeatures } from './features'
import { renderOffer } from './offer'
import { renderTestimonials } from './testimonials'
import { renderFaq } from './faq'
import { renderContact } from './contact'

/**
 * The one place a SectionKind becomes markup. The switch is exhaustive over the
 * discriminated union and carries NO default branch, so adding a kind in @sahoda/shared
 * breaks the build here rather than silently rendering nothing — and, more importantly,
 * there is no fallback arm in which unescaped content could be assembled by hand.
 *
 * `withContactAnchor` is REQUIRED rather than defaulted, and that is the point: a default of
 * `true` would let two calls in the same document both emit `id="contact"` — the exact defect
 * the parameter exists to remove — and a default of `false` would let a document render with
 * no anchor at all while every `#contact` CTA on it points at nothing. Neither failure has an
 * honest default, so the caller must state which document it is rendering into. `renderBody` is
 * that caller, and it is the only one.
 */
export const renderSection = (
  section: NormalizedSection,
  ctx: RenderContext,
  withContactAnchor: boolean,
): string => {
  const node = section.section
  switch (node.kind) {
    case 'hero':
      return renderHero(node.content, ctx)
    case 'features':
      return renderFeatures(node.content, ctx)
    case 'offer':
      return renderOffer(node.content, ctx)
    case 'testimonials':
      return renderTestimonials(node.content, ctx)
    case 'faq':
      return renderFaq(node.content, ctx)
    case 'contact':
      return renderContact(node.content, ctx, withContactAnchor)
  }
}

export { renderHero, renderFeatures, renderOffer, renderTestimonials, renderFaq, renderContact }
