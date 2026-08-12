import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD, type BrandFieldMetaMap } from '@sahoda/shared'

import { readBrain } from '@/lib/brand/read-brain'
import { BRAIN_FIELDS, RING_DENOMINATOR } from '@/lib/brand/fields'
import { provenanceOf } from '@/lib/brand/provenance'
import { writeLeaf } from '@/lib/brand/leaf'

import BrainPage from './page'

/**
 * /brain answers four different questions, and each one carries a different
 * remedy. The read layer's split is covered in read-brain's own tests; this is
 * the screen keeping its half of the bargain — plus the one claim the whole
 * feature exists to make: a filled brain is not a confirmed one.
 */

vi.mock('@/lib/brand/read-brain', () => ({ readBrain: vi.fn() }))
vi.mock('@/app/actions/workspace', () => ({ createWorkspace: vi.fn() }))
vi.mock('@/app/actions/brand-field', () => ({ confirmBrainField: vi.fn() }))

const mockedReadBrain = vi.mocked(readBrain)

/** A brain with exactly one field confirmed — stored provenance, not a diff. */
const CONFIRMED_EMOTION: BrandFieldMetaMap = {
  'hook.primary_emotion': { kind: 'asked', confirmed: true, source: 'owner' },
}

const OK = {
  status: 'ok' as const,
  active: DEMO_FALLBACK_PAYLOAD,
  version: 1,
  provenance: new Map(),
  meta: undefined,
  intake: undefined,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedReadBrain.mockResolvedValue(OK)
})

describe('/brain', () => {
  test('renders every editable field', async () => {
    render(await BrainPage())

    for (const field of BRAIN_FIELDS) {
      expect(screen.getAllByText(field.label).length, field.path).toBeGreaterThan(0)
    }
  })

  test('a freshly resolved brain counts 0 confirmed, though every field is filled', async () => {
    render(await BrainPage())

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText(`of ${RING_DENOMINATOR}`)).toBeInTheDocument()
    // Filled, not confirmed: the values are all on screen.
    expect(screen.getByText(DEMO_FALLBACK_PAYLOAD.brand_persona.archetype)).toBeInTheDocument()
  })

  test('counts a confirmed field, and only that one', async () => {
    const edited = writeLeaf(DEMO_FALLBACK_PAYLOAD, 'hook.primary_emotion', 'Confidence')
    mockedReadBrain.mockResolvedValue({
      ...OK,
      active: edited,
      version: 2,
      provenance: provenanceOf(CONFIRMED_EMOTION),
      meta: CONFIRMED_EMOTION,
    })

    render(await BrainPage())

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })

  test('points at the most valuable unanswered question', async () => {
    render(await BrainPage())
    expect(screen.getByText(BRAIN_FIELDS[0]!.question)).toBeInTheDocument()
  })

  describe('the derived field', () => {
    test('shows its evidence rather than a certainty', async () => {
      render(await BrainPage())

      expect(screen.getByText('Signal lock')).toBeInTheDocument()
      expect(screen.getByText('Drawn from')).toBeInTheDocument()
      // The model's own account of the verdict is the primary evidence.
      expect(screen.getByText(DEMO_FALLBACK_PAYLOAD.alignment.note)).toBeInTheDocument()
    })

    test('says outright that it is not counted', async () => {
      render(await BrainPage())
      expect(screen.getByText('Derived — not counted')).toBeInTheDocument()
    })

    test('is not editable — a conclusion is not a question anyone can answer', async () => {
      render(await BrainPage())

      // One Edit button per editable field, and not one more.
      expect(screen.getAllByRole('button', { name: /edit/i })).toHaveLength(RING_DENOMINATOR)
    })
  })

  describe('the four answers', () => {
    test('no workspace — create one, do not offer a resolve that cannot work', async () => {
      mockedReadBrain.mockResolvedValue({ status: 'no-workspace' })
      render(await BrainPage())

      expect(screen.getByText('Create a workspace to build a Brand Brain')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    })

    test('no brain — offer onboarding, not empty cards at 0/15', async () => {
      mockedReadBrain.mockResolvedValue({ status: 'no-brain' })
      render(await BrainPage())

      expect(screen.getByText("Sahoda doesn't know your brand yet")).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /set up your brand brain/i })).toHaveAttribute(
        'href',
        '/onboarding',
      )
      // Rendering 0 of 15 here would claim a brain exists and is unconfirmed.
      expect(screen.queryByText(`of ${RING_DENOMINATOR}`)).not.toBeInTheDocument()
    })

    test('unreadable — reload, and nothing was charged', async () => {
      mockedReadBrain.mockResolvedValue({ status: 'unreadable' })
      render(await BrainPage())

      expect(screen.getByRole('alert')).toHaveTextContent('reload to try again')
      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    })
  })

  describe('a zero that needs explaining', () => {
    /**
     * Until this release every write was stamped `resolved`, Finish included, so
     * a workspace whose owner corrected a dozen cards during setup has no
     * `manual` version and opens at 0 of 15. The count is right; an unexplained
     * zero beside "editing is free" reads as "your corrections were discarded".
     */
    test('explains the zero rather than leaving it to be misread as lost work', async () => {
      render(await BrainPage())

      expect(screen.getByRole('status')).toHaveTextContent(
        /only started recording who wrote each field/,
      )
    })

    test('drops the explanation once anything is confirmed', async () => {
      const edited = writeLeaf(DEMO_FALLBACK_PAYLOAD, 'hook.primary_emotion', 'Confidence')
      mockedReadBrain.mockResolvedValue({
        ...OK,
        active: edited,
        provenance: provenanceOf(CONFIRMED_EMOTION),
        meta: CONFIRMED_EMOTION,
      })

      render(await BrainPage())

      expect(
        screen.queryByText(/only started recording who wrote each field/),
      ).not.toBeInTheDocument()
    })
  })

  test('the free edit and the paid resolve are told apart in words', async () => {
    render(await BrainPage())

    expect(screen.getByText(/Editing a field here is free/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /re-running the whole resolve/i })).toHaveAttribute(
      'href',
      '/onboarding',
    )
  })
})
