import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { PostSchema } from '@sahoda/shared'

import { PostCard } from '@/components/posts/post-card'
import { forDisplay } from '@/lib/posts/display-post'

/**
 * What a post card calls a post, and when it was last saved.
 *
 * ── WHAT QA SAW ──────────────────────────────────────────────────────────────
 * Five drafts on /posts, every one of them headed "Untitled post", two of them
 * indistinguishable from each other, and no date anywhere on the card. The list
 * is ordered by `updated_at` (read.ts) but nothing on screen said so, and
 * `scheduled_at` is null on a draft so the one timestamp the card could render
 * never rendered. A list that cannot tell two rows apart is not a list.
 *
 * ── THE MUTATION ─────────────────────────────────────────────────────────────
 * · Drop the `firstLineOf` fallback from `displayTitleOf` → the two identical
 *   drafts collapse back onto one heading.
 * · Delete the `savedAge` span → the two drafts become byte-identical again.
 * · Delete the `heading.source === 'derived' ? bodyAfterFirstLine(...)` ternary
 *   → the card prints the same sentence as heading and excerpt.
 * · Revert the muted class to `!title &&` → a derived heading, which is the
 *   post's own words, gets styled as if it were the placeholder.
 */

// The list controls are client islands over server actions that reach Clerk on
// import. Same mocks `channel-chips.test.tsx` uses for the same components.
vi.mock('@/app/actions/planner', () => ({ approvePost: vi.fn() }))
vi.mock('@/app/actions/posts', () => ({ savePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const NOW = new Date('2026-08-22T12:00:00.000Z')

const baseRow = {
  workspace_id: '22222222-2222-4222-8222-222222222222',
  title: null as string | null,
  body: null as string | null,
  status: 'draft',
  channels: [] as string[],
  scheduled_at: null,
  origin: 'manual',
  created_by: 'user_1',
  created_at: '2026-08-20T10:00:00.000Z',
  updated_at: '2026-08-20T10:00:00.000Z',
}

function cardFor(overrides: Partial<typeof baseRow> & { id: string }) {
  return forDisplay(PostSchema.parse({ ...baseRow, ...overrides }))
}

describe('two drafts nobody named', () => {
  test('do not render as the same card', () => {
    // Arrange — the QA row, twice: no title, the SAME body, saved 15 min apart.
    const body = 'Fresh chai every morning at the new counter.'
    const older = cardFor({
      id: '11111111-1111-4111-8111-111111111111',
      body,
      updated_at: '2026-08-22T11:40:00.000Z',
    })
    const newer = cardFor({
      id: '33333333-3333-4333-8333-333333333333',
      body,
      updated_at: '2026-08-22T11:55:00.000Z',
    })

    // Act
    const first = render(<PostCard post={older} now={NOW} variantStates={[]} />)
    const second = render(<PostCard post={newer} now={NOW} variantStates={[]} />)

    // Assert — the defect is two rows a reader cannot tell apart.
    expect(first.container.textContent).not.toBe(second.container.textContent)

    // And the thing that tells them apart is a stated save time on each.
    const olderSaved = first.container.textContent?.match(/Saved\s+\S+.*?ago/)
    const newerSaved = second.container.textContent?.match(/Saved\s+\S+.*?ago/)
    expect(olderSaved).not.toBeNull()
    expect(newerSaved).not.toBeNull()
    expect(olderSaved?.[0]).not.toBe(newerSaved?.[0])
  })

  test('are headed by their own first line, not by a placeholder', () => {
    // Arrange
    const post = cardFor({
      id: '11111111-1111-4111-8111-111111111111',
      body: 'Fresh chai every morning.\nFrom the new counter by the window.',
    })

    // Act
    const { container } = render(<PostCard post={post} now={NOW} variantStates={[]} />)

    // Assert
    expect(container.querySelector('h2')?.textContent).toContain('Fresh chai every morning.')
    expect(screen.queryByText(/untitled/i)).toBeNull()
  })
})

describe('a card never claims more than the row supports', () => {
  test('does not call a one-line draft empty just because the line became the heading', () => {
    // Arrange — a body with no newline in it at all. Everything it has is now
    // in the heading, which is NOT the same fact as having no body.
    const post = cardFor({
      id: '11111111-1111-4111-8111-111111111111',
      body: 'Fresh chai every morning at the new counter.',
    })

    // Act
    const { container } = render(<PostCard post={post} now={NOW} variantStates={[]} />)

    // Assert — the words are on the card, and the card does not deny them.
    expect(container.textContent).toContain('Fresh chai every morning at the new counter.')
    expect(screen.queryByText(/no content/i)).toBeNull()
  })

  test('still says so when the row genuinely has no body', () => {
    // Arrange
    const post = cardFor({ id: '11111111-1111-4111-8111-111111111111' })

    // Act
    render(<PostCard post={post} now={NOW} variantStates={[]} />)

    // Assert — the one case the claim is true in.
    expect(screen.getByText(/no content/i)).toBeInTheDocument()
    expect(screen.getByText(/untitled post/i)).toBeInTheDocument()
  })

  test('does not print the heading twice when the heading came from the body', () => {
    // Arrange
    const first = 'Fresh chai every morning.'
    const post = cardFor({
      id: '11111111-1111-4111-8111-111111111111',
      body: `${first}\nFrom the new counter by the window.`,
    })

    // Act
    const { container } = render(<PostCard post={post} now={NOW} variantStates={[]} />)

    // Assert — the excerpt starts at the SECOND line.
    expect(container.textContent).toContain('From the new counter by the window.')
    expect(container.textContent?.split(first)).toHaveLength(2)
  })

  test('shows the WHOLE body as the excerpt when the author gave a title', () => {
    // No-regression pin: the first line is only stripped when it was promoted.
    // Arrange
    const post = cardFor({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Monsoon menu',
      body: 'Fresh chai every morning.\nFrom the new counter.',
    })

    // Act
    const { container } = render(<PostCard post={post} now={NOW} variantStates={[]} />)

    // Assert
    expect(container.textContent).toContain('Fresh chai every morning.')
    expect(container.textContent).toContain('From the new counter.')
  })
})

describe('the heading tells you where it came from', () => {
  test('a derived heading is not muted — those are the post’s own words', () => {
    // Arrange
    const post = cardFor({
      id: '11111111-1111-4111-8111-111111111111',
      body: 'Fresh chai every morning.',
    })

    // Act
    const { container } = render(<PostCard post={post} now={NOW} variantStates={[]} />)

    // Assert
    expect(container.querySelector('h2')?.className).not.toContain('text-muted')
  })

  test('the placeholder IS muted — it is the one heading that is not content', () => {
    // Arrange
    const post = cardFor({ id: '11111111-1111-4111-8111-111111111111' })

    // Act
    const { container } = render(<PostCard post={post} now={NOW} variantStates={[]} />)

    // Assert
    expect(container.querySelector('h2')?.className).toContain('text-muted')
  })
})
