import { render, screen, waitFor } from '@testing-library/react'

const madeLine = (text: string) =>
  screen.getByText(
    (_, el) => el?.tagName === 'P' && (el.textContent ?? '').replace(/\s+/g, ' ').includes(text),
  )
import { describe, expect, test, vi } from 'vitest'

import type { IllustrateState } from '@/app/actions/illustrate-post'

import { WeekIllustrator } from './week-illustrator'

const calls: string[] = []
const results: IllustrateState[] = []
vi.mock('@/app/actions/illustrate-post', () => ({
  illustratePost: (id: string) => {
    calls.push(id)
    return Promise.resolve(results.shift() ?? { ok: false, insufficient: false, message: 'none' })
  },
}))

const made = (postId: string): IllustrateState => ({
  ok: true,
  postId,
  assetId: 'a-' + postId,
  previewUrl: 'https://example.test/' + postId,
  formatLabel: '1080 × 1080 · Square',
  creditsCharged: 6,
  balanceAfter: 40,
  attachRefused: false,
})

describe('WeekIllustrator', () => {
  test('draws the cards in order, one at a time, and reports the total once', async () => {
    calls.length = 0
    results.push(made('p1'), made('p2'))
    const onDone = vi.fn()
    const { container } = render(
      <WeekIllustrator postIds={['p1', 'p2']} costPerPicture={6} onDone={onDone} />,
    )

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(calls).toEqual(['p1', 'p2'])
    expect(onDone).toHaveBeenCalledWith({ made: 2, charged: 12, balanceAfter: 40 })
    expect(container.querySelectorAll('img')).toHaveLength(2)
    expect(madeLine('2 of 2 made')).toBeInTheDocument()
  })

  test('one refused picture is reported and the run goes on to the next draft', async () => {
    calls.length = 0
    results.push(
      made('p1'),
      {
        ok: false,
        insufficient: false,
        message: 'Sahoda could not make this picture. Nothing was charged.',
      },
      made('p3'),
    )
    const onDone = vi.fn()
    render(<WeekIllustrator postIds={['p1', 'p2', 'p3']} costPerPicture={6} onDone={onDone} />)

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(calls).toEqual(['p1', 'p2', 'p3'])
    expect(screen.getByRole('alert')).toHaveTextContent(/Nothing was charged/)
    expect(madeLine('2 of 3 made')).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledWith({ made: 2, charged: 12, balanceAfter: 40 })
  })

  test('an empty wallet stops the run: the later drafts are never asked for', async () => {
    calls.length = 0
    results.push({
      ok: false,
      insufficient: true,
      required: 6,
      available: 2,
      message: '',
    } as IllustrateState)
    const onDone = vi.fn()
    render(<WeekIllustrator postIds={['p1', 'p2', 'p3']} costPerPicture={6} onDone={onDone} />)
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(calls).toEqual(['p1'])
  })

  test('an insufficient balance names the shortfall', async () => {
    calls.length = 0
    results.push({
      ok: false,
      insufficient: true,
      required: 6,
      available: 2,
      message: '',
    } as IllustrateState)
    render(<WeekIllustrator postIds={['p1']} costPerPicture={6} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/needs 6 credits and you have 2/)
  })
})
