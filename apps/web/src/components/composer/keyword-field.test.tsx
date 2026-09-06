import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONSTRAINTS, charCountFor, normalizeKeywords } from '@sahoda/shared'

import { KeywordField } from './keyword-field'

/**
 * The keyword box — the hashtag box, renamed and reshaped.
 *
 * `extras.hashtags` was counted by the meter, capped by `spec.maxHashtags`,
 * appended to the published body by `formatForPlatform`, and fillable only by a
 * generated variant. Instagram's 30-tag limit was a rule about a field nobody
 * could write to, with a "Remove extra hashtags" fix-it for a list the writer
 * never made. That is why this box exists at all.
 *
 * It now holds KEYWORDS in the founder's format — `[marketing]`, not
 * `#marketing` (REQUESTS §34). The stored key is still `hashtags`, because it is
 * untyped jsonb with production rows already in it and renaming the key would
 * orphan every one.
 *
 * WHAT WOULD MAKE THESE WORTHLESS: asserting the box exists. The property that
 * matters is that what it stores is what the ENGINE will publish and count —
 * a second normaliser here is exactly how the meter and the formatter came to
 * disagree once before.
 */

function setup(
  channel: 'x' | 'instagram' | 'gbp' = 'instagram',
  initial?: string[],
  brackets = true,
) {
  const onChange = vi.fn()
  const onBracketsChange = vi.fn()
  render(
    <KeywordField
      channel={channel}
      label={channel === 'instagram' ? 'Instagram' : channel === 'x' ? 'X' : 'Google Business'}
      hashtags={initial}
      onChange={onChange}
      brackets={brackets}
      onBracketsChange={onBracketsChange}
    />,
  )
  return { onChange, onBracketsChange }
}

const box = () => screen.getByLabelText('Keywords')

/** Renders with a seeded list so the brackets prop can be flipped in place. */
function setupRerenderable(seed: string) {
  const view = render(
    <KeywordField
      channel="instagram"
      label="Instagram"
      hashtags={[seed]}
      onChange={vi.fn()}
      brackets
      onBracketsChange={vi.fn()}
    />,
  )
  return {
    rerender: (brackets: boolean) =>
      view.rerender(
        <KeywordField
          channel="instagram"
          label="Instagram"
          hashtags={[seed]}
          onChange={vi.fn()}
          brackets={brackets}
          onBracketsChange={vi.fn()}
        />,
      ),
  }
}

describe('the box reflects keywords written from outside it (generation)', () => {
  // MEASURED live: "Adapt for N channels" filled extras.hashtags and the body
  // updated, but this box stayed empty. `raw` was seeded once at mount and never
  // heard the prop change. These pin the sync — and pin that it does not clobber
  // what the writer is typing.
  function view(hashtags: string[] | undefined) {
    return (
      <KeywordField
        channel="x"
        label="X"
        hashtags={hashtags}
        onChange={vi.fn()}
        brackets={false}
        onBracketsChange={vi.fn()}
      />
    )
  }

  test('an external write to hashtags shows up in the box', () => {
    const r = render(view(undefined))
    expect((box() as HTMLInputElement).value).toBe('')
    r.rerender(view(['classics shelf', 'weekend browse']))
    expect((box() as HTMLInputElement).value).toBe('classics shelf, weekend browse')
  })

  test("a writer's own typing is not reset by the round-trip", async () => {
    // The value the writer types flows out through onChange and can come back as
    // the `hashtags` prop; that must not wipe the caret. Simulate it: type, then
    // rerender with the same list the box already holds.
    const r = render(view(undefined))
    await userEvent.type(box(), 'my own keyword')
    r.rerender(view(['my own keyword']))
    expect((box() as HTMLInputElement).value).toBe('my own keyword')
  })
})

describe('what the box stores is what the engine publishes', () => {
  test('wraps a bare word exactly as the frozen normaliser does', async () => {
    // Retargeted from "adds the missing #". The CLAIM is unchanged and is the
    // point of the test: this box does not normalise anything itself, it hands
    // the engine's own function the writer's text. Comparing against
    // `normalizeKeywords(...)` rather than a literal is what pins that.
    const { onChange } = setup()
    await userEvent.type(box(), 'chai')

    expect(onChange).toHaveBeenLastCalledWith(normalizeKeywords(['chai']))
    expect(onChange).toHaveBeenLastCalledWith(['[chai]'])
  })

  /**
   * ── THIS CLAIM IS REVERSED, AND THE REVERSAL IS THE FEATURE ────────────────
   * It read "splits on spaces and commas, the way people type them". That was
   * correct for HASHTAGS: a hashtag cannot contain a space, so `#chai pune` is
   * genuinely two of them.
   *
   * A keyword can contain a space, and that is the entire reason the founder
   * asked for brackets. Splitting on whitespace would turn the one thing a
   * customer actually searches for into three things nobody does. So the
   * separator is now the comma, and the old assertion is inverted on purpose.
   */
  test('does NOT split on spaces, so a keyword may be a phrase', async () => {
    const { onChange } = setup()
    await userEvent.type(box(), 'chai in pune, monsoon')

    expect(onChange).toHaveBeenLastCalledWith(['[chai in pune]', '[monsoon]'])
  })

  test('reads a legacy hash off a stored row rather than wrapping it', async () => {
    // No migration runs. Every row written before the ruling holds `#chai`, and
    // `[#chai]` is neither format and reads as a bug on a live account.
    const { onChange } = setup()
    await userEvent.type(box(), '#chai, pune')

    expect(onChange).toHaveBeenLastCalledWith(['[chai]', '[pune]'])
  })

  test('drops a duplicate, because a platform counts it once', async () => {
    const { onChange } = setup()
    await userEvent.type(box(), 'chai, CHAI')

    expect(onChange).toHaveBeenLastCalledWith(['[chai]'])
  })

  test('stores undefined for an empty box, never an empty array', async () => {
    // The stored shape has always meant "this channel has none" by absence.
    // Writing `[]` would change what every reader of `extras` sees.
    const { onChange } = setup('instagram', ['#chai'])
    await userEvent.clear(box())

    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  test('opens showing a legacy row in the NEW format, not the stored one', async () => {
    // A round-trip hazard: the box seeds its text from the stored list. Seeding
    // it raw would show `#chai` in a box whose help text promises `[chai]`.
    setup('instagram', ['#chai', '#pune'])

    expect(box()).toHaveValue('[chai] [pune]')
  })

  test('the keywords it stores really do cost characters', () => {
    // The reason the counter and this box have to agree: the tail is published.
    const spec = CONSTRAINTS.instagram
    const bare = charCountFor(spec, { body: 'Chai' })
    const tagged = charCountFor(spec, { body: 'Chai', hashtags: ['#chai', '#pune'] })

    expect(tagged).toBeGreaterThan(bare)
  })
})

describe('the reader sees the exact published string', () => {
  test('shows the bracketed tail that will reach the platform', async () => {
    // THE ONE THIS FORMAT NEEDS MOST. `[chai]` publishes literally, so the
    // literal has to be on screen before anybody presses Send rather than
    // discovered afterwards on a live account.
    setup()
    await userEvent.type(box(), 'chai, pune')

    expect(screen.getByText(/Published at the end as \[chai\] \[pune\]/)).toBeInTheDocument()
  })

  test('says how to separate them while the box is still empty', async () => {
    // Comma separation is not guessable from an empty box, and getting it wrong
    // silently makes one keyword out of a list.
    setup()

    expect(screen.getByText(/Separate them with commas/i)).toBeInTheDocument()
  })
})

describe('the count is the channel’s own', () => {
  test('shows Instagram’s cap and turns red past it', async () => {
    setup()
    const limit = CONSTRAINTS.instagram.maxHashtags!
    // READ THE TEXT, not the box: a count with no denominator reads as nonsense.
    await userEvent.type(box(), 'a, b')
    expect(screen.getByText(String(limit))).toBeInTheDocument()
    expect(box()).not.toHaveAttribute('aria-invalid')

    await userEvent.clear(box())
    await userEvent.type(box(), Array.from({ length: limit + 1 }, (_, i) => `t${i}`).join(', '))
    expect(box()).toHaveAttribute('aria-invalid')
  })

  test('shows no cap on a channel that declares none', async () => {
    setup('x')
    expect(CONSTRAINTS.x.maxHashtags).toBeUndefined()
    await userEvent.type(box(), 'a, b, c')

    expect(screen.queryByText('/')).not.toBeInTheDocument()
  })
})

describe('Google Business gets no box, and is told why', () => {
  test('offers no input at all, because the formatter drops the tail', () => {
    setup('gbp')

    expect(screen.queryByLabelText('Keywords')).not.toBeInTheDocument()
    expect(screen.getByText(/does nothing on a Google Business post/i)).toBeInTheDocument()
  })
})

/**
 * THE BRACKETS ARE A CHOICE NOW (REQUESTS §35).
 *
 * §34 shipped `[marketing]` publishing literally, because the brief asked for
 * that format and never said whether a follower should see it. The founder's
 * answer was to make it a tick box. These pin the two things that decide whether
 * that box is trustworthy: the line beneath states the string that will ACTUALLY
 * go out, and it changes with the box.
 */
describe('the brackets are the writer’s choice', () => {
  test('ticked publishes them, and says so', async () => {
    setup()
    await userEvent.type(box(), 'chai, pune')

    expect(screen.getByText(/Published at the end as \[chai\] \[pune\]/)).toBeInTheDocument()
  })

  test('unticked publishes the bare words, and says THAT', async () => {
    // THE ONE THAT MATTERS. A tick box that changed nothing about the stated
    // outcome would be a control the reader cannot verify, on the one string
    // that reaches a live account.
    setup('instagram', undefined, false)
    await userEvent.type(box(), 'chai, pune')

    expect(screen.getByText(/Published at the end as chai pune/)).toBeInTheDocument()
    expect(screen.queryByText(/\[chai\]/)).not.toBeInTheDocument()
  })

  test('the box itself keeps its brackets either way', async () => {
    // Deliberate: in the INPUT the brackets are what makes `chai in pune,
    // monsoon` legible as two things rather than four words. What publishes is
    // stated separately, on its own line, so neither string has to do both jobs.
    setup('instagram', undefined, false)
    await userEvent.type(box(), 'chai in pune')

    expect(screen.getByText(/Published at the end as chai in pune/)).toBeInTheDocument()
  })

  test('reports the tick, so the caller can store it', async () => {
    const { onBracketsChange } = setup()

    await userEvent.click(screen.getByRole('checkbox'))

    expect(onBracketsChange).toHaveBeenLastCalledWith(false)
  })

  test('the empty-box hint drops the format when brackets are off', async () => {
    // Promising `[keyword]` to somebody who has turned brackets off is the same
    // defect as showing the wrong tail: a claim the press will not honour.
    //
    // SCOPED TO THE HELP LINE. My first version queried the whole screen and
    // failed against correct markup — the tick box's own hint says "Tick to
    // publish them as [keyword]", which is a description of what the box WOULD
    // do and is the one place that string still belongs.
    setup('instagram', undefined, false)

    const hint = screen.getByText(/Separate them with commas/i)
    expect(hint).toBeInTheDocument()
    expect(hint.textContent).not.toMatch(/\[keyword\]/)
  })

  test('and keeps it when brackets are on', async () => {
    // The counterweight. A hint that never named the format would satisfy the
    // assertion above and tell a first-time reader nothing.
    setup()

    expect(screen.getByText(/Separate them with commas/i).textContent).toMatch(/\[keyword\]/)
  })
})

describe('the AI affordance that does not exist', () => {
  test('is NOT mentioned here, because it would be mentioned once per channel', () => {
    // It used to be. MEASURED in a 1440 screenshot: the same paragraph printed on
    // every version card — four identical apologies on one screen. docs/27 §1
    // counted six different ways of saying "nothing yet" and called it the
    // problem; repeating one way six times is the same problem. It is said once,
    // in the writing pane, with the other two AI things this screen cannot do.
    setup()

    expect(screen.queryByText(/cannot suggest/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /suggest/i })).not.toBeInTheDocument()
  })
})

/**
 * THE BOX AND THE POST HAVE TO AGREE (REQUESTS §36).
 *
 * The box always showed brackets whatever was published, and the line beneath
 * stated the published form separately. The founder read that as two answers to
 * one question: "when the box is tiked the square bracket is applies on the
 * above bar also". A field that says `[cat]` over a post that says `cat` is
 * lying about the one thing it exists to show.
 *
 * ── AND THE TIMING IS THE HARD HALF ─────────────────────────────────────────
 * Rewriting the text on every keystroke moves the caret out from under the
 * writer — `cat` becomes `[c]at` on the first character. So it settles on BLUR,
 * and immediately when the tick box moves. Both are pinned; so is the fact that
 * it does NOT settle while the field still has focus.
 */
describe('the box mirrors what will be published', () => {
  test('does NOT rewrite while the writer is still typing', async () => {
    // The guard on the caret. A box that reshapes itself mid-word is unusable,
    // and it is the obvious wrong way to satisfy the test below.
    setup()
    await userEvent.type(box(), 'cat')

    expect(box()).toHaveValue('cat')
  })

  test('settles into the published form when focus leaves', async () => {
    setup()
    await userEvent.type(box(), 'cat')
    await userEvent.tab()

    expect(box()).toHaveValue('[cat]')
  })

  test('settles WITHOUT brackets when the box is unticked', async () => {
    // The other direction, and it is not symmetrical: unbracketed keywords are
    // comma-separated, because `chai in pune monsoon` is unreadable and
    // un-reparseable while `[chai in pune] [monsoon]` shows its own boundaries.
    setup('instagram', undefined, false)
    await userEvent.type(box(), 'chai in pune, monsoon')
    await userEvent.tab()

    expect(box()).toHaveValue('chai in pune, monsoon')
  })

  test('re-shapes the box the moment the tick box moves', () => {
    // No blur involved. Ticking is a statement about what publishes, so the box
    // has to answer immediately or it is showing the previous answer.
    const { rerender } = setupRerenderable('cat')

    expect(box()).toHaveValue('[cat]')
    rerender(false)
    expect(box()).toHaveValue('cat')
    rerender(true)
    expect(box()).toHaveValue('[cat]')
  })

  test('opens showing the UNBRACKETED form when the post publishes that way', () => {
    // The seed, not the settle. A stored row opened with the box unticked must
    // not show brackets it is not going to publish.
    setup('instagram', ['chai', 'pune'], false)

    expect(box()).toHaveValue('chai, pune')
  })
})

describe('what the tick box says the keywords are for', () => {
  test('names the benefit, and puts it on the KEYWORDS rather than the brackets', () => {
    // The founder asked for a line saying this "helps in boosting the posts".
    // Written as the true version: keywords are what search can match, brackets
    // are punctuation and rank nothing.
    setup()

    expect(screen.getByText(/another way to find this post/i)).toBeInTheDocument()
  })

  test('promises no reach and quotes no number, because Sahoda measures neither', () => {
    // "Boosts your posts by 30%" is a figure no query produced. So is "boosts
    // your posts". The line says what the keywords DO, not what they will get.
    setup()
    const line = screen.getByText(/another way to find this post/i).textContent ?? ''

    expect(line).not.toMatch(/\d+\s*%/)
    expect(line).not.toMatch(/\bboost/i)
    expect(line).not.toMatch(/\breach\b/i)
  })
})
