import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { SectionCardEmpty } from './section-card-empty'
import { BRAIN_SECTIONS, fieldsInSection } from '@/lib/brand/fields'

/**
 * A Brand Brain section before the brain exists.
 *
 * This card renders on /brain, /brain/identity and the four /brain sub-routes
 * whenever `readBrain()` comes back `no-brain` — which is what EVERY new account
 * sees. Each field row used to be a bare `&mdash;`, which docs/26 §11 forbids by
 * name and §4 replaces with a mark that carries an accessible name.
 *
 * The dash was not a wrong CLAIM — the field really is real and really has no
 * value yet. It was an unnameable one: a screen reader skipped from one field
 * label to the next and the absence never reached the reader at all.
 */

/**
 * EVERY section, not the first one.
 *
 * `fieldsInSection` returns a different set per key, and the two routes that
 * render this card between them cover all five: /brain/identity asks for
 * brand_persona + hook + customer_persona, /brain/voice for voice + taboo. A
 * guard pinned to `BRAIN_SECTIONS[0]` would have proved one fifth of what its
 * name claims — the same sibling-shape hole this lane found twice in product
 * code, reproduced in the check written to catch it.
 */
describe.each(BRAIN_SECTIONS.map((s) => [s.key, s] as const))(
  'a Brand Brain section with no brain behind it — %s',
  (_key, section) => {
    test('every empty field is announced, not left as a glyph', () => {
      render(<SectionCardEmpty section={section} />)
      const fields = fieldsInSection(section.key)
      expect(fields.length).toBeGreaterThan(0)
      for (const field of fields) {
        expect(screen.getByText(`${field.label} has not been measured yet`)).toBeInTheDocument()
      }
    })

    test('renders no bare em dash', () => {
      const { container } = render(<SectionCardEmpty section={section} />)
      // The glyph, anywhere in the rendered text. A dash standing alone in a value
      // slot is the thing §11 names; asserting on the class would pass for a mark
      // that renders one anyway.
      expect(container.textContent ?? '').not.toContain('—')
    })

    test('claims no tally it could not have measured', () => {
      // There is no brain, so "0/4 confirmed" would be a reading of one.
      render(<SectionCardEmpty section={section} />)
      expect(screen.queryByText(/\d+\s*\/\s*\d+\s*confirmed/i)).toBeNull()
    })

    test('still names every field, so the reader learns what a brain holds', () => {
      render(<SectionCardEmpty section={section} />)
      for (const field of fieldsInSection(section.key)) {
        // getAllByText, not getByText. The `taboo` section is TITLED "Red lines"
        // and also holds a FIELD called "Red lines", so an exact-match single
        // query throws on a legitimate arrangement. Found only once the guard
        // ran over every section instead of the first — which is the argument
        // for looping, in miniature.
        expect(screen.getAllByText(field.label).length).toBeGreaterThan(0)
      }
    })
  },
)
