/**
 * A page's sections → the contents of its `<main>`, and the one place the document-scoped
 * `id="contact"` is allocated.
 *
 * ## Why this is not a `.map()`
 *
 * `id` is unique per DOCUMENT. A section renderer sees one section and cannot know whether
 * another section already claimed a document-wide name, so a stateless `map` over
 * `renderSection` emitted `id="contact"` once per contact section — two contact sections on one
 * page (ordinary model output: `[hero, contact, hero, contact]`) shipped invalid HTML in which
 * every `#contact` link resolved to the first one and the second section was unreachable by the
 * CTA written to reach it.
 *
 * The allocation therefore lives one level up, here, at exactly the scope the id is unique over.
 * `renderDocument` calls this once per page, so two pages in one bundle each get their own
 * anchor and cannot interfere: there is no bundle-level state anywhere on this path.
 *
 * ## The claim follows the markup, not the array
 *
 * The anchor goes to the first contact section that actually EMITS something.
 * `renderContact` returns `''` for a section with neither copy nor a usable form endpoint, and
 * awarding the anchor to that section would leave the page with no element carrying the id while
 * its `#contact` CTAs still pointed at it — trading an invalid-id defect for a dangling-link one.
 * So `claimed` is set from the rendered string, not from the section's position or kind alone.
 *
 * KNOWN GAP, pre-existing and NOT introduced here: a page with a `#contact` CTA and no contact
 * section at all still emits a link to a fragment that matches nothing. Fixing that means the
 * CTA renderers learning the page's anchor set and demoting an unmatched fragment to inert text
 * (the policy `renderCta` already applies to an unsafe href). It belongs with that policy, not
 * with this allocator, and it is unchanged by this module either way.
 */
import type { NormalizedSection } from '../normalize/section-content'
import type { RenderContext } from './context'
import { renderSection } from './sections'

const CONTACT_KIND = 'contact'

interface BodyState {
  /** Rendered sections in order. Accumulated as parts, never as a growing concatenation. */
  readonly parts: readonly string[]
  /** True once a contact section has emitted markup carrying `id="contact"`. */
  readonly claimed: boolean
}

const EMPTY: BodyState = { parts: [], claimed: false }

const append = (state: BodyState, section: NormalizedSection, ctx: RenderContext): BodyState => {
  const html = renderSection(section, ctx, !state.claimed)
  return {
    parts: [...state.parts, html],
    claimed: state.claimed || (section.section.kind === CONTACT_KIND && html !== ''),
  }
}

export const renderBody = (sections: readonly NormalizedSection[], ctx: RenderContext): string =>
  sections.reduce((state, section) => append(state, section, ctx), EMPTY).parts.join('')
