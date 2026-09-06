import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { useState } from 'react'

import { DEFAULT_DATA, type OnboardingData } from '../store'
import { AudienceStep } from './audience-step'

/**
 * THE COLLAPSED "TELL US MORE" FIELDS ARE NOT IN THE TAB ORDER.
 *
 * MEASURED 2026-09-07 at 1280x820: with the panel closed, three Tabs from the
 * audience field landed on `#f-loc`, and the screenshot showed nothing focused
 * anywhere — the panel collapses with `0fr` rows and `overflow: hidden`, not
 * `display: none`, so the browser still considers the inputs focusable.
 */
function Harness() {
  const [data, setData] = useState<OnboardingData>({
    ...DEFAULT_DATA,
    palette: [],
    logoName: '',
    audience: 'weekend readers',
  })
  return <AudienceStep data={data} patch={(next) => setData((p) => ({ ...p, ...next }))} />
}

describe('audience step — collapsed fields', () => {
  test('closed: the four extra fields are out of the tab order', () => {
    render(<Harness />)
    for (const name of ['Age range', 'Location', 'Role or title', 'Interests']) {
      expect(screen.getByLabelText(name)).toHaveAttribute('tabindex', '-1')
    }
  })

  test('open: they come back into it', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /tell us more/i }))
    for (const name of ['Age range', 'Location', 'Role or title', 'Interests']) {
      expect(screen.getByLabelText(name)).toHaveAttribute('tabindex', '0')
    }
  })
})
