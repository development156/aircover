import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { ComposerPanels } from '@/components/studio/composer-panels'
import { generatableFormats } from '@/lib/studio/formats'
import { MODE_RULES, ruleFor } from '@/lib/studio/modes'
import { defaultModelId } from '@/lib/studio/models'

/**
 * THE APPROACH AND LOGO CONTROLS, AFTER THE FOUNDER'S RULING.
 *
 * Model got its own file (`model-picker.test.tsx`); this one covers the other
 * two controls the ruling named: Approach used to print a one-line
 * description under every mode's name, and Logo used to print a paragraph of
 * reasoning under its buttons whichever state was picked. Both moved into a
 * single "Details" drawer per control, opened next to the legend, per
 * `/connections`' own pattern (`channel-details.tsx`).
 */

// jsdom implements `<dialog>` but not `showModal`/`close`, which `Drawer`
// calls. Same stub `delete-post-button.test.tsx` uses, for the same reason.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
})
afterEach(cleanup)

const FORMATS = generatableFormats()

function baseProps() {
  return {
    modelId: defaultModelId(),
    onChooseModel: () => {},
    mode: 'on_brand' as const,
    rule: ruleFor('on_brand'),
    onChooseMode: () => {},
    formats: FORMATS,
    formatId: FORMATS[0]!.id,
    onChangeFormat: () => {},
    library: { status: 'ok' as const, pictures: [] },
    picked: [],
    onToggleReference: () => {},
    onAddReference: () => {},
    stampEnabled: true,
    onSetStampEnabled: () => {},
    stampAnchor: 'bottom-right' as const,
    onSetStampAnchor: () => {},
    stampSizeStep: 'medium' as const,
    onSetStampSizeStep: () => {},
  }
}

describe('the approach control', () => {
  /**
   * MUTATION: put `option.what` back on each mode button in
   * `composer-panels.tsx`, and this goes red — the choosing surface names
   * approaches, it does not explain them.
   */
  test('names each approach, and explains none of them up front', () => {
    render(<ComposerPanels {...baseProps()} openPanel="approach" />)
    const group = screen.getByRole('group', { name: /how should sahoda approach it/i })
    for (const rule of MODE_RULES) {
      if (!rule.ready) continue
      expect(within(group).getByRole('button', { name: rule.label })).toBeTruthy()
    }
    // `what` never printed inline. "Uses what Sahoda knows" is On brand's own
    // sentence and could not be mistaken for another mode's.
    expect(group.textContent).not.toContain('Uses what Sahoda knows about your business')
  })

  /**
   * MUTATION: delete `rule.what` from `ApproachReasons` instead of moving it
   * there, and this goes red for every ready mode.
   */
  test('what each approach does is reachable from the control’s own drawer', async () => {
    const user = userEvent.setup()
    render(<ComposerPanels {...baseProps()} openPanel="approach" />)

    await user.click(screen.getByRole('button', { name: /read what each approach does/i }))
    const drawer = screen.getByRole('dialog')
    for (const rule of MODE_RULES) {
      expect(drawer.textContent, rule.mode).toContain(rule.what)
    }
  })

  test('exactly one "Details" affordance for the control, not one per approach', () => {
    render(<ComposerPanels {...baseProps()} openPanel="approach" />)
    expect(screen.getAllByRole('button', { name: /read what each approach does/i })).toHaveLength(1)
  })

  test('closes on the dialog’s own close event (Escape, the X, the backdrop)', async () => {
    const user = userEvent.setup()
    render(<ComposerPanels {...baseProps()} openPanel="approach" />)
    await user.click(screen.getByRole('button', { name: /read what each approach does/i }))
    const drawer = screen.getByRole('dialog')
    drawer.dispatchEvent(new Event('close'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('the logo control', () => {
  /**
   * MUTATION: put either sentence back as an unconditional `<p>` under the
   * buttons in `composer-logo-panel.tsx`, and the "up front" half of this
   * goes red.
   */
  test('the stamp, corner and size controls show only their own names up front', () => {
    const { container } = render(<ComposerPanels {...baseProps()} openPanel="logo" />)
    // Scoped by `data-guide` rather than `getByRole('group', {name})`: the
    // fieldset's own accessible name (from its legend) and the inner
    // `role="group"` pill both match "stamp your logo on this picture", and
    // querying by name alone finds both.
    const fieldset = container.querySelector('[data-guide="studio-logo"]') as HTMLElement
    expect(within(fieldset).getByRole('button', { name: 'Stamp it' })).toBeTruthy()
    expect(within(fieldset).getByRole('button', { name: 'Leave it off' })).toBeTruthy()
    expect(fieldset.textContent).not.toContain('never a one-way choice')
    expect(fieldset.textContent).not.toContain('Nothing already made changes')
  })

  /**
   * MUTATION: delete either sentence from `ComposerLogoPanel`'s drawer
   * content instead of moving it there, and this goes red.
   */
  test('what stamping on and off each mean are both reachable from the drawer', async () => {
    const user = userEvent.setup()
    render(<ComposerPanels {...baseProps()} openPanel="logo" />)

    await user.click(screen.getByRole('button', { name: /read what the logo settings mean/i }))
    const drawer = screen.getByRole('dialog')
    expect(drawer.textContent).toContain('never a one-way choice')
    expect(drawer.textContent).toContain('Nothing already made changes')
  })

  test('closes on the dialog’s own close event', async () => {
    const user = userEvent.setup()
    render(<ComposerPanels {...baseProps()} openPanel="logo" />)
    await user.click(screen.getByRole('button', { name: /read what the logo settings mean/i }))
    const drawer = screen.getByRole('dialog')
    drawer.dispatchEvent(new Event('close'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('the size and match controls, left as they were', () => {
  /**
   * The founder's own instruction: the size `<select>` and the count stepper
   * were already compact and honest, so they are unchanged. This asserts the
   * size control carries no "Details" affordance — there is nothing to move
   * off it.
   */
  test('the size control has no drawer, because it never printed reasoning to move', () => {
    render(<ComposerPanels {...baseProps()} openPanel="size" />)
    expect(screen.queryByRole('button', { name: /read what/i })).toBeNull()
  })

  test('the match control has no drawer either — its legend already names one fact', () => {
    render(<ComposerPanels {...baseProps()} openPanel="match" />)
    expect(screen.queryByRole('button', { name: /read what/i })).toBeNull()
  })
})
