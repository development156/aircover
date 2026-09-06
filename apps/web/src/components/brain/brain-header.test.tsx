import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { BrainHeader } from './brain-header'
import { BRAIN_FIELDS } from '@/lib/brand/fields'
import type { Provenance } from '@/lib/brand/provenance'

/**
 * The re-resolve control on the /brain aside.
 *
 * It shipped as an inline link inside a muted paragraph, accent-coloured at
 * rest with an underline only on hover, sitting in a card whose eyebrow is also
 * accent-coloured. The founder read it as emphasised prose rather than as the
 * one control on the panel that navigates away and spends credits.
 *
 * These guards pin the AFFORDANCE and the CLAIM, never the wording. The label
 * is matched case-insensitively through a verb, so the sentence can be rewritten
 * freely; what may not change silently is that the thing is a pressable control,
 * that it still goes to /onboarding, and that a reader is still told the action
 * is paid and rewrites confirmed fields before they press it.
 */

/**
 * Provenance is a ReadonlyMap, so the fixtures are real Maps and not object
 * literals. Built through `provenanceOf` where it matters, so the fixture cannot
 * drift from the shape the product actually produces.
 */

/** No field confirmed. Every brain written before `field_meta` existed looks like this. */
const NOTHING_CONFIRMED: Provenance = new Map()

/** Every field confirmed, so `ring.next` is null and the other branch renders. */
const ALL_CONFIRMED: Provenance = new Map(
  BRAIN_FIELDS.map((field) => [field.path, 'confirmed' as const]),
)

describe('the re-resolve control', () => {
  test('is a control, not a run of text', () => {
    render(<BrainHeader provenance={NOTHING_CONFIRMED} version={16} />)

    // getByRole('link') is the affordance assertion: a <span> carrying an
    // onClick, or the accent-coloured prose this replaced, has no role and
    // fails here. Matched by an accessible name containing the verb, so the
    // copy can change without the guard going stale.
    const control = screen.getByRole('link', { name: /rebuild/i })
    expect(control).toHaveAttribute('href', '/onboarding')

    // It LOOKS like a button, which is the entire request. `inline-flex` and
    // `h-control` come from buttonVariants and from nowhere else in this file;
    // a revert to the inline link drops both.
    expect(control.className).toContain('inline-flex')
    expect(control.className).toContain('h-control')
  })

  test('is not the panel primary — a re-resolve destroys confirmed work', () => {
    render(<BrainHeader provenance={NOTHING_CONFIRMED} version={16} />)
    const control = screen.getByRole('link', { name: /rebuild/i })

    // The secondary recipe, asserted by the token that separates it from
    // primary. `bg-primary` here would mean the paid, destructive path had been
    // promoted to the one recommended action on the Brand Brain.
    expect(control.className).toContain('bg-surface')
    expect(control.className).not.toContain('bg-primary')
  })

  test('the price and the consequence reach a screen reader before the press', () => {
    render(<BrainHeader provenance={NOTHING_CONFIRMED} version={16} />)
    const control = screen.getByRole('link', { name: /rebuild/i })

    const describedBy = control.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const note = document.getElementById(describedBy as string)
    expect(note).not.toBeNull()

    // The two CLAIMS, not the sentence: that it is paid, and that it overwrites
    // fields the person already confirmed. Extracting the link from the
    // paragraph is exactly the edit that could have dropped either.
    expect(note?.textContent).toMatch(/costs credits/i)
    expect(note?.textContent).toMatch(/confirmed/i)
  })

  test('renders on the every-field-confirmed branch too', () => {
    // The panel has two shapes and the control sits below both. A guard pinned
    // to one branch would prove half of what its name claims.
    render(<BrainHeader provenance={ALL_CONFIRMED} version={16} />)
    const control = screen.getByRole('link', { name: /rebuild/i })
    expect(control).toHaveAttribute('href', '/onboarding')
    // The clothes too, not just the href. `href` alone survived the mutation
    // that put the control back inside the paragraph, which made this the one
    // guard of the four that proved nothing about the branch it names.
    expect(control.className).toContain('inline-flex')
    expect(screen.getByText(/every field is confirmed/i)).toBeInTheDocument()
  })
})
