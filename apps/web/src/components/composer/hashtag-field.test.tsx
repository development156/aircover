import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONSTRAINTS, charCountFor, normalizeHashtags } from '@sahoda/shared'

import { HashtagField } from './hashtag-field'

/**
 * The hashtag box, which has never existed.
 *
 * `extras.hashtags` was counted by the meter, capped by `spec.maxHashtags`,
 * appended to the published body by `formatForPlatform`, and fillable only by a
 * generated variant. Instagram's 30-tag limit was a rule about a field nobody
 * could write to, with a "Remove extra hashtags" fix-it for a list the writer
 * never made.
 *
 * WHAT WOULD MAKE THESE WORTHLESS: asserting the box exists. The property that
 * matters is that what it stores is what the ENGINE will publish and count —
 * a second normaliser here is exactly how the meter and the formatter came to
 * disagree once before.
 */

function setup(channel: 'x' | 'instagram' | 'gbp' = 'instagram', initial?: string[]) {
  const onChange = vi.fn()
  render(
    <HashtagField
      channel={channel}
      label={channel === 'instagram' ? 'Instagram' : channel === 'x' ? 'X' : 'Google Business'}
      hashtags={initial}
      onChange={onChange}
    />,
  )
  return { onChange }
}

describe('what the box stores is what the engine publishes', () => {
  test('adds the missing # exactly as the frozen normaliser does', async () => {
    const { onChange } = setup()
    await userEvent.type(screen.getByLabelText('Hashtags'), 'chai')
    expect(onChange).toHaveBeenLastCalledWith(normalizeHashtags(['chai']))
    expect(onChange).toHaveBeenLastCalledWith(['#chai'])
  })

  test('splits on spaces and commas, the way people type them', async () => {
    const { onChange } = setup()
    await userEvent.type(screen.getByLabelText('Hashtags'), '#chai, pune monsoon')
    expect(onChange).toHaveBeenLastCalledWith(['#chai', '#pune', '#monsoon'])
  })

  test('drops a duplicate, because a platform counts it once', async () => {
    const { onChange } = setup()
    await userEvent.type(screen.getByLabelText('Hashtags'), '#chai #CHAI')
    expect(onChange).toHaveBeenLastCalledWith(['#chai'])
  })

  test('stores undefined for an empty box, never an empty array', async () => {
    const { onChange } = setup('instagram', ['#chai'])
    await userEvent.clear(screen.getByLabelText('Hashtags'))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  test('the tags it stores really do cost characters', () => {
    // The reason the counter and this box have to agree: the tail is published.
    const spec = CONSTRAINTS.instagram
    const bare = charCountFor(spec, { body: 'Chai' })
    const tagged = charCountFor(spec, { body: 'Chai', hashtags: ['#chai', '#pune'] })
    expect(tagged).toBeGreaterThan(bare)
  })
})

describe('the count is the channel’s own', () => {
  test('shows Instagram’s cap and turns red past it', async () => {
    setup()
    const box = screen.getByLabelText('Hashtags')
    const limit = CONSTRAINTS.instagram.maxHashtags!
    // READ THE TEXT, not the box: a count with no denominator reads as nonsense.
    await userEvent.type(box, '#a #b')
    expect(screen.getByText(String(limit))).toBeInTheDocument()
    expect(box).not.toHaveAttribute('aria-invalid')

    await userEvent.clear(box)
    await userEvent.type(box, Array.from({ length: limit + 1 }, (_, i) => `#t${i}`).join(' '))
    expect(box).toHaveAttribute('aria-invalid')
  })

  test('shows no cap on a channel that declares none', async () => {
    setup('x')
    expect(CONSTRAINTS.x.maxHashtags).toBeUndefined()
    await userEvent.type(screen.getByLabelText('Hashtags'), '#a #b #c')
    expect(screen.queryByText('/')).not.toBeInTheDocument()
  })
})

describe('Google Business gets no box, and is told why', () => {
  test('offers no input at all, because the formatter drops them', () => {
    setup('gbp')
    expect(screen.queryByLabelText('Hashtags')).not.toBeInTheDocument()
    expect(screen.getByText(/do nothing on a Google Business post/i)).toBeInTheDocument()
  })
})

describe('the AI affordance that does not exist', () => {
  test('says so, and is not a control', () => {
    setup()
    const note = screen.getByText(/cannot suggest hashtags yet/i)
    expect(note).toBeInTheDocument()
    // A disabled button is still announced as a button. This is a sentence.
    expect(screen.queryByRole('button', { name: /suggest/i })).not.toBeInTheDocument()
  })
})
