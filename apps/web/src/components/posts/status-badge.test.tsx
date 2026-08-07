import { render, screen } from '@testing-library/react'
import { PostStatusSchema } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { StatusBadge, STATUS_STYLES } from './status-badge'

/**
 * The post chip under the Certainty System.
 *
 * These assert on CLASSES and TEXT rather than computed colour, deliberately —
 * that is the point of the system. The app wears each customer's brand, so a
 * chip that is only distinguishable by colour is broken by definition. What must
 * hold is the structural signature: solid fill, hairline, dash, hatch.
 */

const ALL_STATUSES = PostStatusSchema.options

function classesOf(el: HTMLElement): string[] {
  return el.className.split(/\s+/)
}

function chip(): HTMLElement {
  return screen.getByTestId('status-chip')
}

describe('StatusBadge certainty treatment', () => {
  test('published + live is .is-real — solid, it happened', () => {
    render(<StatusBadge status="published" mode="live" />)

    expect(classesOf(chip())).toContain('is-real')
  })

  test('published + fixture is .is-simulated AND shows a visible label', () => {
    render(<StatusBadge status="published" mode="fixture" />)

    expect(classesOf(chip())).toContain('is-simulated')
    // The hatch alone is not a claim. The label must be real rendered text, not
    // a title attribute or an aria-label a sighted user never sees.
    expect(screen.getByText(/simulated/i)).toBeVisible()
  })

  test('a simulated chip NEVER renders without its label', () => {
    // Guards the honesty rule directly: if a future refactor drops the label,
    // the hatch would silently become an unexplained texture.
    for (const mode of ['fixture'] as const) {
      const { unmount } = render(<StatusBadge status="published" mode={mode} />)
      const el = chip()
      expect(classesOf(el)).toContain('is-simulated')
      expect(el.textContent?.toLowerCase()).toContain('simulated')
      unmount()
    }
  })

  test('approved is .is-committed — hairline, it will happen', () => {
    render(<StatusBadge status="approved" mode={null} />)

    expect(classesOf(chip())).toContain('is-committed')
  })

  test('idea and draft are .is-proposed — dashed, provisional', () => {
    const { unmount } = render(<StatusBadge status="draft" mode={null} />)
    expect(classesOf(chip())).toContain('is-proposed')
    unmount()

    render(<StatusBadge status="idea" mode={null} />)
    expect(classesOf(chip())).toContain('is-proposed')
  })

  test('failed takes a danger stroke and NO certainty class', () => {
    render(<StatusBadge status="failed" mode={null} />)
    const classes = classesOf(chip())

    expect(classes.some((c) => c.includes('danger'))).toBe(true)
    for (const certainty of ['is-real', 'is-committed', 'is-proposed', 'is-simulated']) {
      expect(classes).not.toContain(certainty)
    }
  })
})

describe('StatusBadge never over-claims', () => {
  test('published with an UNKNOWN mode is not solid', () => {
    // The publish-log read failed or found nothing. This is the fail-safe made
    // visible: the chip drops to the committed hairline rather than claiming
    // the publish happened.
    render(<StatusBadge status="published" mode={null} />)
    const classes = classesOf(chip())

    expect(classes).not.toContain('is-real')
    expect(classes).toContain('is-committed')
  })

  test('no status × mode combination other than published+live renders .is-real', () => {
    for (const status of ALL_STATUSES) {
      for (const mode of ['live', 'fixture', 'mixed', null] as const) {
        if (status === 'published' && mode === 'live') continue
        const { unmount } = render(<StatusBadge status={status} mode={mode} />)
        expect(classesOf(chip()), `${status}/${mode}`).not.toContain('is-real')
        unmount()
      }
    }
  })

  test('mixed modes render committed, not real and not simulated', () => {
    render(<StatusBadge status="published" mode="mixed" />)
    const classes = classesOf(chip())

    expect(classes).toContain('is-committed')
    expect(classes).not.toContain('is-real')
    expect(classes).not.toContain('is-simulated')
  })
})

describe('StatusBadge stays exhaustive', () => {
  test('STATUS_STYLES still covers every PostStatus', () => {
    // Kept for the compile-time exhaustiveness guarantee even though the four
    // unwritten statuses render no certainty treatment: adding a value to the
    // enum must remain a build error here, not a silently unstyled chip.
    for (const status of ALL_STATUSES) {
      expect(STATUS_STYLES[status], status).toBeTruthy()
      expect(STATUS_STYLES[status].label, status).toBeTruthy()
    }
  })

  test('every status renders something with a readable label and no crash', () => {
    for (const status of ALL_STATUSES) {
      const { unmount } = render(<StatusBadge status={status} mode={null} />)
      expect(chip().textContent?.trim().length, status).toBeGreaterThan(0)
      unmount()
    }
  })

  test('the chip exposes its status for the tour and for tests', () => {
    render(<StatusBadge status="approved" mode={null} />)

    expect(chip().getAttribute('data-status')).toBe('approved')
  })
})
