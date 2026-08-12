import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { buildResolveFormData } from './onboarding-flow'
import { SparkStep, type SparkValues } from './spark-step'

/**
 * The Spark screen has TWO independent submit paths and they are easy to drift
 * apart: Generate posts the <form>, so it carries whatever has a `name=`;
 * Regenerate never touches the form and hands the action a FormData assembled by
 * `buildResolveFormData`. A field added to one and not the other resolves from
 * less than the user typed, silently, on only one of the two buttons.
 *
 * `description` is the field that made this worth a test: it is the only intake
 * measured to move `signal_lock` off `weak` (2026-08-12), so losing it on the
 * Regenerate path would quietly undo the one thing that worked.
 */

const SPARK: SparkValues = {
  name: 'Chai & Chapters',
  category: 'Retail — books & specialty café',
  description: 'A two-room bookshop off a Buxi Bazaar side street.',
  website: 'https://chaiandchapters.in',
  instagram: '@chaiandchapters',
}

function renderStep(overrides: Partial<Parameters<typeof SparkStep>[0]> = {}) {
  return render(
    <SparkStep
      formAction={() => {}}
      onSubmitStart={() => {}}
      isPending={false}
      attemptError={null}
      spark={SPARK}
      onSparkChange={() => {}}
      logo={null}
      onLogoChange={() => {}}
      generateCost={50}
      {...overrides}
    />,
  )
}

describe('SparkStep intake', () => {
  test('asks for a one-sentence description, and shows what good looks like', () => {
    renderStep()
    const field = screen.getByLabelText(/what do you do, in one sentence/i)
    expect(field).toHaveAttribute('name', 'description')
    // A placeholder reading "describe your business" reliably returns the
    // category back; a specific one is the instruction.
    expect(field.getAttribute('placeholder')).toMatch(/Buxi Bazaar/)
  })

  test('reports a typed description back to the parent as a description patch', () => {
    const onSparkChange = vi.fn()
    renderStep({ onSparkChange })
    fireEvent.change(screen.getByLabelText(/what do you do, in one sentence/i), {
      target: { value: 'We roast slow and shelve Odia poetry first.' },
    })
    expect(onSparkChange).toHaveBeenCalledWith({
      description: 'We roast slow and shelve Odia poetry first.',
    })
  })

  test('every SparkValues field has a name= on the form, so Generate carries it', () => {
    const { container } = renderStep()
    const named = new Set(
      Array.from(container.querySelectorAll('[name]')).map((el) => el.getAttribute('name')),
    )
    for (const key of Object.keys(SPARK)) {
      expect(named, `<form> is missing name="${key}" — Generate would drop it`).toContain(key)
    }
  })

  test('buildResolveFormData carries the SAME fields, so Regenerate drops none', () => {
    const data = buildResolveFormData(SPARK)
    for (const [key, value] of Object.entries(SPARK)) {
      expect(data.get(key), `Regenerate would drop "${key}"`).toBe(value)
    }
  })

  test('the two paths agree exactly — no field on one and not the other', () => {
    const { container } = renderStep()
    const formNames = new Set(
      Array.from(container.querySelectorAll('input[name], textarea[name]')).map((el) =>
        el.getAttribute('name'),
      ),
    )
    const regenerateNames = new Set(Array.from(buildResolveFormData(SPARK).keys()))
    expect([...regenerateNames].sort()).toEqual([...formNames].sort())
  })
})
