import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { DoorState } from '@/app/actions/onboarding-door'

import { DoorStep } from './door-step'

/**
 * The read-back exists to prove what Sahoda actually FETCHED. When the door was
 * a sentence the customer typed two inches above, echoing it back proves
 * nothing — it is the customer's own words, not evidence of a read. These tests
 * pin that distinction: the corpus block and the "here is what we read" framing
 * belong to the url/pdf arms only.
 */
function streamOf(result: DoorState) {
  const chunk = new TextEncoder().encode(JSON.stringify({ type: 'done', result }) + '\n')
  let sent = false
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined }
          sent = true
          return { done: false, value: chunk }
        },
      }),
    },
  }
}

const SENTENCE = 'We bake sourdough on Prabhat Road and nothing is bought in.'

const TYPED: DoorState = {
  ok: true,
  kind: 'sentence',
  text: SENTENCE,
  label: 'what you told us',
  foundName: '',
  colors: [],
  note: null,
  fellBack: false,
  stages: [],
  costUsd: 0,
}

async function run(result: DoorState, typed: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamOf(result)))
  render(<DoorStep onContinue={vi.fn()} onBack={vi.fn()} />)
  await userEvent.type(screen.getByLabelText('Or just tell us'), typed)
  await userEvent.click(screen.getByRole('button', { name: /Read this/ }))
  await screen.findByRole('button', { name: /That is us/ })
}

// The textarea ALSO matches by text, so the mirror must be isolated by tag —
// a bare queryByText can never go green while the field keeps its value.
const mirrored = () => screen.queryAllByText(SENTENCE).filter((el) => el.tagName !== 'TEXTAREA')

describe('DoorStep read-back', () => {
  test('does not mirror a typed sentence back', async () => {
    await run(TYPED, SENTENCE)
    expect(screen.getByLabelText('Or just tell us')).toHaveValue(SENTENCE)
    expect(mirrored()).toHaveLength(0)
    expect(screen.queryByText(/Here is what we read/)).toBeNull()
    expect(screen.queryByText(/Check it is yours/)).toBeNull()
    expect(screen.getByText('We will use your sentence as you wrote it')).toBeInTheDocument()
    expect(screen.getByText(/nothing new to check/)).toBeInTheDocument()
  })

  test('claims no colour verdict on the sentence arm', async () => {
    await run(TYPED, SENTENCE)
    expect(screen.queryByText(/did not find a colour here/)).toBeNull()
    expect(screen.getByText(/A sentence carries no colour/)).toBeInTheDocument()
  })

  test('fallback arm keeps the note and still does not mirror', async () => {
    await run(
      {
        ...TYPED,
        note: 'We could not read what you gave us, so we used your own words instead.',
        fellBack: true,
      },
      SENTENCE,
    )
    expect(screen.getByText(/we used your own words instead/)).toBeInTheDocument()
    expect(mirrored()).toHaveLength(0)
    expect(screen.queryByText(/Nothing was fetched/)).toBeNull()
  })

  test('a real read still shows the corpus and names the source', async () => {
    const CORPUS = 'about.title: Acme Bakery\nabout.body: We have baked since 1998.'
    await run(
      { ...TYPED, kind: 'url', label: 'acme.com', text: CORPUS, colors: ['declared-brand-colour'] },
      'ignored sentence text that is long enough',
    )
    expect(screen.getByText(/We have baked since 1998/)).toBeInTheDocument()
    expect(screen.getByText('Here is what we read from acme.com')).toBeInTheDocument()
    expect(screen.getByText(/Check it is yours/)).toBeInTheDocument()
  })
})

/**
 * THE ONLY WAY FORWARD MUST LOOK LIKE A WAY FORWARD.
 *
 * For a customer with no website and no PDF, "Continue without it" is the only
 * route out of this step. It shipped as a ghost button — no border, no
 * underline, muted text, 28px tall — sitting under the message that had just
 * refused them, and it read as a caption. A remedy nobody recognises as a
 * control is not a remedy.
 *
 * These assert the CLAIM rather than the class list: it is a real button, and
 * it does not wear the treatment reserved for incidental actions.
 */
/**
 * The refusal a customer with no website and no PDF actually meets: the read
 * came back with nothing, and "Continue without it" is their only route on.
 */
async function renderRefused() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      streamOf({
        ok: false,
        message: 'Give us one thing to read — a link, a PDF, or a sentence.',
      }),
    ),
  )
  render(<DoorStep onContinue={vi.fn()} onBack={vi.fn()} />)
  await userEvent.type(screen.getByLabelText('Or just tell us'), 'x')
  await userEvent.click(screen.getByRole('button', { name: /Read this/ }))
  return screen.findByRole('button', { name: /Continue without it/i })
}

describe('the way out of the door is a control, not a caption', () => {
  test('offers Continue without it as a real button after a failed read', async () => {
    const out = await renderRefused()
    expect(out.className).not.toMatch(/\btext-muted\b/)
    expect(out.className).toMatch(/surface-ring-firm/)
  })

  test('it is not the 28px small size', async () => {
    const out = await renderRefused()
    expect(out.className).not.toMatch(/\bh-7\b/)
  })
})
