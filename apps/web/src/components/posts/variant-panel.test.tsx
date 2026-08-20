import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { CONSTRAINTS } from '@sahoda/shared'

import { VariantPanel } from './variant-panel'
import type { VariantState } from './use-variants'

/**
 * The save control on a per-channel variant.
 *
 * These exist because the first frame ever taken of `/posts/[id]` showed a
 * greyed pill reading "Saved" — a `<button disabled>` standing in for state,
 * which is the defect docs/28 removed from `/planner` and which walked through
 * here in a second file. Reading the logic then found the sharper half: the
 * label is chosen by `!dirty`, and a channel that has NEVER been written to
 * seeds as `{ body: '', dirty: false }` (`use-variants.ts` EMPTY), so an
 * untouched channel claimed a save that never happened — directly under the
 * panel's own sentence "Nothing drafted for this channel yet."
 */

function state(over: Partial<VariantState> = {}): VariantState {
  return {
    body: '',
    extras: {},
    dirty: false,
    saving: false,
    error: null,
    conflict: null,
    version: undefined,
    permalink: null,
    ...over,
  }
}

function panel(over: Partial<VariantState> = {}) {
  return render(
    <VariantPanel
      channel="instagram"
      state={state(over)}
      canonicalBody="The canonical body."
      mediaCount={1}
      onBodyChange={vi.fn()}
      onExtrasChange={vi.fn()}
      onSave={vi.fn()}
      onKeepMine={vi.fn()}
      onUseTheirs={vi.fn()}
    />,
  )
}

describe('the save control states what is true', () => {
  test('a channel that was never written to does not claim a save', () => {
    panel({ body: '', dirty: false })
    // The claim, not the glyph: "Saved" anywhere on an untouched channel is a
    // statement about a write that did not happen.
    expect(screen.queryByText(/^saved$/i)).toBeNull()
  })

  test('a channel that was never written to offers no save control', () => {
    panel({ body: '', dirty: false })
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })

  test('state is never rendered as a disabled control', () => {
    // docs/26 §10.2 — a disabled button is still announced as a button, so the
    // reader is offered an action, takes it, and nothing happens.
    panel({ body: 'Stored copy.', dirty: false })
    for (const button of screen.queryAllByRole('button')) {
      expect(button).not.toBeDisabled()
    }
  })

  test('a saved, unchanged channel says so without offering an action', () => {
    panel({ body: 'Stored copy.', dirty: false })
    expect(screen.getByText(/^saved$/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save variant$/i })).toBeNull()
  })

  test('an edited channel offers a real, enabled save', () => {
    panel({ body: 'Edited copy.', dirty: true })
    const save = screen.getByRole('button', { name: /^save variant$/i })
    expect(save).toBeEnabled()
  })

  test('an edited channel does not also say it is unsaved in words', () => {
    // One thing per state. An ENABLED "Save variant" already is the unsaved
    // signal; a "Not saved yet" beside it is the same claim twice, which is the
    // /home defect docs/28 fixed by demoting the second copy.
    panel({ body: 'Edited copy.', dirty: true })
    expect(screen.queryByText(/not saved yet/i)).toBeNull()
  })

  test('a channel mid-save says so', () => {
    panel({ body: 'Edited copy.', dirty: true, saving: true })
    expect(screen.getByText(/^saving$/i)).toBeInTheDocument()
  })
})

describe('the panel uses the design system primitives', () => {
  test('the call-to-action picker is a real select with an accessible name', () => {
    // gbp is the channel whose spec carries `gbp`, so the picker renders.
    expect(CONSTRAINTS.gbp.gbp).toBeDefined()
    render(
      <VariantPanel
        channel="gbp"
        state={state({ body: 'Stored copy.' })}
        canonicalBody="The canonical body."
        mediaCount={1}
        onBodyChange={vi.fn()}
        onExtrasChange={vi.fn()}
        onSave={vi.fn()}
        onKeepMine={vi.fn()}
        onUseTheirs={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox', { name: /call to action/i })).toBeInTheDocument()
  })
})
