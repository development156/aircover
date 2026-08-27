import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { TemplateCard } from './template-card'
import type { TemplatesRead } from '@/lib/templates/read'

/**
 * The template card, and the one rule it exists to keep.
 *
 * ── A COUNT IS A CLAIM ABOUT THE CUSTOMER'S LIBRARY ─────────────────────────
 * The reference card says "14 templates matched to your industry". A number there
 * says the library was read and holds that many. So it may appear on exactly one
 * of the three reads, and the other two must not be dressed as small versions of
 * it: a failed read showing `0` says "you have none" about a question nobody
 * managed to ask, and an empty library showing `0 templates` reports a
 * measurement where nothing was measured.
 */

const calls = vi.hoisted(() => ({ saved: [] as unknown[] }))
vi.mock('@/app/actions/templates', () => ({
  saveTemplate: (...args: unknown[]) => {
    calls.saved.push(args)
    return Promise.resolve({ ok: true, templateId: 't1' })
  },
}))

const ok = (n: number): TemplatesRead => ({
  status: 'ok',
  templates: Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Template ${i}`,
    channel: null,
    body: `body ${i}`,
  })),
})

beforeEach(() => {
  calls.saved = []
})

/** Open the browser, which is where the library now lives (REQUESTS §36). */
async function browse(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /browse templates/i }))
}

describe('what the card is allowed to say', () => {
  /**
   * ── THE COUNT MOVED; THE RULE ABOUT IT DID NOT ────────────────────────────
   * It used to sit on the resting card. The founder's ruling (§36) leaves the
   * card with two controls and nothing else, so the number went INSIDE the
   * browser — which is a better place for it anyway: a count is an answer, and
   * it now appears where somebody has just asked the question.
   */
  test('shows the count inside the browser, when the library was actually read', async () => {
    const user = userEvent.setup()
    render(<TemplateCard read={ok(3)} body="" channel={null} onUse={() => {}} />)

    expect(screen.queryByText('3 saved')).toBeNull()
    await browse(user)

    expect(screen.getByText('3 saved')).toBeVisible()
  })

  test('the resting card carries the two controls and no library at all', async () => {
    // The ruling, verbatim: "it should not show any thing except save it as a
    // template and browse template". A sidebar card that prints every template
    // name grows without limit above the editor nobody scrolled past it to reach.
    const { container } = render(
      <TemplateCard read={ok(3)} body="Fresh chai" channel={null} onUse={() => {}} />,
    )

    expect(container.querySelector('[data-template-browse]')).not.toBeNull()
    expect(container.querySelector('[data-template-save]')).not.toBeNull()
    expect(container.querySelector('[data-template-browser]')).toBeNull()
    expect(screen.queryByText('Template 1')).toBeNull()
  })

  test('shows NO number when the read failed', () => {
    render(<TemplateCard read={{ status: 'unreadable' }} body="" channel={null} onUse={() => {}} />)

    expect(screen.getByText(/could not read your templates/i)).toBeVisible()
    // And Browse is REFUSED rather than absent — the §33 pattern. A card with
    // one control and no account of the other explains nothing.
    expect(screen.getByRole('button', { name: /browse templates/i })).toBeDisabled()
    expect(screen.queryByText(/\bsaved\b/i)).toBeNull()
    // The specific lie this forbids.
    expect(screen.queryByText(/^0 /)).toBeNull()
    expect(screen.queryByText(/nothing saved yet/i)).toBeNull()
  })

  test('shows an empty STATE rather than a zero when there are none', () => {
    render(<TemplateCard read={ok(0)} body="" channel={null} onUse={() => {}} />)

    expect(screen.getByText(/nothing saved yet/i)).toBeVisible()
    expect(screen.queryByText(/0 saved/)).toBeNull()
    expect(screen.getByRole('button', { name: /browse templates/i })).toBeDisabled()
  })

  test('says nothing apologetic when Browse actually works', async () => {
    // The counterweight to the three above. Printing "nothing saved yet" beside
    // a working Browse would be an apology for a state the card is not in.
    const user = userEvent.setup()
    render(<TemplateCard read={ok(3)} body="" channel={null} onUse={() => {}} />)

    expect(screen.getByRole('button', { name: /browse templates/i })).toBeEnabled()
    expect(screen.queryByText(/nothing saved yet/i)).toBeNull()
    expect(screen.queryByText(/could not read/i)).toBeNull()
    await browse(user)
    expect(screen.queryByText(/nothing saved yet/i)).toBeNull()
  })

  test('tells an account with no workspace what is actually true, with no retry', () => {
    render(
      <TemplateCard read={{ status: 'no-workspace' }} body="" channel={null} onUse={() => {}} />,
    )
    expect(screen.getByText(/belong to a workspace/i)).toBeVisible()
    // Reloading cannot make a workspace, so no remedy is offered.
    expect(screen.queryByText(/reload/i)).toBeNull()
  })
})

describe('using and saving', () => {
  test('hands the template’s words to the caller, and writes nothing itself', async () => {
    // The claim is unchanged: choosing a template LOADS it and saves nothing.
    // It is reached through Browse now (§36).
    const onUse = vi.fn()
    const user = userEvent.setup()
    render(<TemplateCard read={ok(2)} body="" channel={null} onUse={onUse} />)

    await browse(user)
    await user.click(screen.getByText('Template 1'))

    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ body: 'body 1' }))
    expect(calls.saved).toEqual([])
  })

  test('closes the browser once a template is chosen', async () => {
    // Choosing is the whole point of opening it. Leaving the list up over an
    // editor that has just changed underneath is a panel with nothing left to do.
    const user = userEvent.setup()
    const { container } = render(
      <TemplateCard read={ok(2)} body="" channel={null} onUse={() => {}} />,
    )

    await browse(user)
    await user.click(screen.getByText('Template 1'))

    expect(container.querySelector('[data-template-browser]')).toBeNull()
  })

  test('filters the list by name, and says a MISS is a miss', async () => {
    // "No template matches X" is a different sentence from "you have none", and
    // the library is not empty here. `1 saved` stays on screen to prove it.
    const user = userEvent.setup()
    render(<TemplateCard read={ok(3)} body="" channel={null} onUse={() => {}} />)

    await browse(user)
    await user.type(screen.getByLabelText(/pick one to start from/i), 'Template 2')
    expect(screen.getByText('Template 2')).toBeVisible()
    expect(screen.queryByText('Template 1')).toBeNull()

    await user.clear(screen.getByLabelText(/pick one to start from/i))
    await user.type(screen.getByLabelText(/pick one to start from/i), 'zzz')
    expect(screen.getByText(/No template matches/i)).toBeVisible()
    expect(screen.queryByText(/nothing saved yet/i)).toBeNull()
    expect(screen.getByText('3 saved')).toBeVisible()
  })

  test('offers saving only when there is something to save', () => {
    const { rerender } = render(
      <TemplateCard read={ok(0)} body="   " channel={null} onUse={() => {}} />,
    )
    // A template of an empty box is not a starting point.
    expect(document.querySelector('[data-template-save]')).toBeNull()

    rerender(<TemplateCard read={ok(0)} body="Fresh chai" channel={null} onUse={() => {}} />)
    expect(document.querySelector('[data-template-save]')).not.toBeNull()
  })

  test('will not save without a name', async () => {
    const user = userEvent.setup()
    render(<TemplateCard read={ok(0)} body="Fresh chai" channel="x" onUse={() => {}} />)

    await user.click(document.querySelector('[data-template-save]') as Element)
    expect(screen.getByRole('button', { name: /save template/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/template name/i), 'Friday offer')
    await user.click(screen.getByRole('button', { name: /save template/i }))

    expect(calls.saved).toEqual([['Friday offer', 'Fresh chai', 'x']])
    // Named back, so a writer with several can tell which one landed.
    expect(await screen.findByText(/Saved as “Friday offer”/)).toBeVisible()
  })
})
