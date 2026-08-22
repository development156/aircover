import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import StudioPage from './page'

/**
 * STUDIO SAYS WHERE THE COLLECTION ISN'T, NEXT TO THE FILTERS THAT WOULD SORT IT.
 *
 * The chip row is a picture of a filter over a gallery this build does not have.
 * `components/roadmap/inert.tsx` licenses that — a chip carries no count, so it
 * claims nothing about a collection existing and being empty — but the only
 * denial on the screen used to sit in the footer, past three sections. The
 * precedent is `/brain/knowledge`, whose empty `DataTable` puts the same
 * sentence directly under its own search row.
 *
 * The assertion matches "no gallery behind these filters" and NOT "no gallery",
 * because the footer's `NotRunningNote` already contains "no gallery of designs
 * to browse". A looser matcher would pass with this sentence deleted, which is a
 * guard that cannot fail.
 */
describe('/studio', () => {
  test('denies the gallery where the filters are, not only in the footer', () => {
    render(<StudioPage />)

    expect(screen.getByText(/no gallery behind these filters/i)).toBeDefined()
  })
})
