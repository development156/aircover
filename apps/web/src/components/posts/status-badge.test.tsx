import { render, screen } from '@testing-library/react'
import { PostStatusSchema } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { StatusBadge, STATUS_STYLES, displayStatus } from './status-badge'
import type { PostOutcome } from '@/lib/posts/publish-evidence'

/**
 * The post chip under the Certainty System.
 *
 * These assert on CLASSES and TEXT rather than computed colour, deliberately —
 * that is the point of the system. The app wears each customer's brand, so a
 * chip that is only distinguishable by colour is broken by definition. What must
 * hold is the structural signature: solid fill, hairline, dash, hatch.
 *
 * ── WHAT THE CHIP READS NOW ──────────────────────────────────────────────────
 * `intent` (`posts.status` — what a person committed to) and `outcome` (what the
 * variant rows prove). It used to read the column plus a publish-log mode, and
 * both were wrong for the paths that run: the publish path writes
 * `post_variants` and never the post row, so a post that is live on every
 * channel still says `approved` there.
 */

const ALL_STATUSES = PostStatusSchema.options
const ALL_OUTCOMES: PostOutcome[] = ['unknown', 'none', 'live', 'partial', 'simulated', 'failed']

function classesOf(el: HTMLElement): string[] {
  return el.className.split(/\s+/)
}

function chip(): HTMLElement {
  return screen.getByTestId('status-chip')
}

describe('StatusBadge certainty treatment', () => {
  test('a live outcome is .is-real — solid, it happened', () => {
    render(<StatusBadge intent="approved" outcome="live" />)

    expect(classesOf(chip())).toContain('is-real')
  })

  test('a simulated outcome is .is-simulated AND shows a visible label', () => {
    render(<StatusBadge intent="approved" outcome="simulated" />)

    expect(classesOf(chip())).toContain('is-simulated')
    // The hatch alone is not a claim. The label must be real rendered text, not
    // a title attribute or an aria-label a sighted user never sees.
    expect(screen.getByText(/simulated/i)).toBeVisible()
  })

  test('a simulated chip NEVER renders without its label', () => {
    // Guards the honesty rule directly: if a future refactor drops the label,
    // the hatch would silently become an unexplained texture.
    for (const intent of ALL_STATUSES) {
      const { unmount } = render(<StatusBadge intent={intent} outcome="simulated" />)
      const el = chip()
      expect(classesOf(el)).toContain('is-simulated')
      expect(el.textContent?.toLowerCase(), intent).toContain('simulated')
      unmount()
    }
  })

  test('approved with nothing published is .is-committed — hairline, it will happen', () => {
    render(<StatusBadge intent="approved" outcome="unknown" />)

    expect(classesOf(chip())).toContain('is-committed')
  })

  test('idea and draft are .is-proposed — dashed, provisional', () => {
    const { unmount } = render(<StatusBadge intent="draft" outcome="unknown" />)
    expect(classesOf(chip())).toContain('is-proposed')
    unmount()

    render(<StatusBadge intent="idea" outcome="unknown" />)
    expect(classesOf(chip())).toContain('is-proposed')
  })

  test('a failed outcome takes a danger stroke and NO certainty class', () => {
    render(<StatusBadge intent="approved" outcome="failed" />)
    const classes = classesOf(chip())

    expect(classes.some((c) => c.includes('danger'))).toBe(true)
    for (const certainty of ['is-real', 'is-committed', 'is-proposed', 'is-simulated']) {
      expect(classes).not.toContain(certainty)
    }
  })
})

describe('the chip says what the post DID, not what the column says', () => {
  test('THE DEFECT: an `approved` post that is live reads "Published", not "Approved"', () => {
    // This is the ordinary shape of a published post here. Before the evidence
    // moved, this chip read "Approved" — the word on the stale column — beside
    // channel chips that said published. Changing only the certainty signature
    // would have left a solid fill under a word denying the publish.
    render(<StatusBadge intent="approved" outcome="live" />)

    expect(chip().textContent).toContain('Published')
    expect(chip().textContent).not.toContain('Approved')
  })

  test('a partly-out post says so, without the dispatcher ever writing `partial`', () => {
    // `posts.status = 'partial'` is written only by the dispatcher settle path,
    // which is behind a flag that defaults off. The evidence reaches the same
    // answer without it.
    render(<StatusBadge intent="approved" outcome="partial" />)

    expect(chip().getAttribute('data-status')).toBe('partial')
    expect(chip().textContent).toContain('Partly published')
  })

  test('the INTENT stays exposed alongside it, so neither is lost', () => {
    render(<StatusBadge intent="approved" outcome="live" />)

    expect(chip().getAttribute('data-status')).toBe('published')
    expect(chip().getAttribute('data-intent')).toBe('approved')
  })

  test('with no evidence the chip falls back to the intent word, unchanged', () => {
    for (const intent of ALL_STATUSES) {
      for (const outcome of ['unknown', 'none'] as const) {
        expect(displayStatus(intent, outcome), `${intent}/${outcome}`).toBe(intent)
      }
    }
  })
})

describe('StatusBadge never over-claims', () => {
  test('an UNKNOWN outcome is never solid, whatever the intent says', () => {
    // The variant read failed or found nothing. This is the fail-safe made
    // visible: the chip drops to a weaker claim rather than asserting a publish.
    for (const intent of ALL_STATUSES) {
      const { unmount } = render(<StatusBadge intent={intent} outcome="unknown" />)
      expect(classesOf(chip()), intent).not.toContain('is-real')
      unmount()
    }
  })

  test('an intent of `published` with no evidence is not solid', () => {
    render(<StatusBadge intent="published" outcome="unknown" />)
    const classes = classesOf(chip())

    expect(classes).not.toContain('is-real')
    expect(classes).toContain('is-committed')
  })

  test('no combination other than a live outcome renders .is-real', () => {
    for (const intent of ALL_STATUSES) {
      for (const outcome of ALL_OUTCOMES) {
        if (outcome === 'live') continue
        const { unmount } = render(<StatusBadge intent={intent} outcome={outcome} />)
        expect(classesOf(chip()), `${intent}/${outcome}`).not.toContain('is-real')
        unmount()
      }
    }
  })

  test('partial renders committed, neither real nor simulated', () => {
    render(<StatusBadge intent="approved" outcome="partial" />)
    const classes = classesOf(chip())

    expect(classes).toContain('is-committed')
    expect(classes).not.toContain('is-real')
    expect(classes).not.toContain('is-simulated')
  })
})

describe('StatusBadge stays exhaustive', () => {
  test('STATUS_STYLES still covers every PostStatus', () => {
    // Kept for the compile-time exhaustiveness guarantee: adding a value to the
    // enum must remain a build error here, not a silently unstyled chip.
    for (const status of ALL_STATUSES) {
      expect(STATUS_STYLES[status], status).toBeTruthy()
      expect(STATUS_STYLES[status].label, status).toBeTruthy()
    }
  })

  test('every intent × outcome renders a readable label and no crash', () => {
    for (const intent of ALL_STATUSES) {
      for (const outcome of ALL_OUTCOMES) {
        const { unmount } = render(<StatusBadge intent={intent} outcome={outcome} />)
        expect(chip().textContent?.trim().length, `${intent}/${outcome}`).toBeGreaterThan(0)
        unmount()
      }
    }
  })

  test('displayStatus only ever returns a real PostStatus', () => {
    for (const intent of ALL_STATUSES) {
      for (const outcome of ALL_OUTCOMES) {
        expect(ALL_STATUSES, `${intent}/${outcome}`).toContain(displayStatus(intent, outcome))
      }
    }
  })
})
