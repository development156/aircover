import { render, screen } from '@testing-library/react'
import type { Post } from '@sahoda/shared'
import { describe, expect, test, vi } from 'vitest'

// PostCard nests DeletePostButton, which calls `useRouter` — no app-router
// context exists in jsdom, so it needs a stand-in (same pattern as
// post-editor.test.tsx and auto-publish-note.test.tsx).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { PostCard } from './post-card'
import { PlannerRow } from '@/components/planner/planner-row'

/**
 * `.blade` marks AGENCY — Sahoda acted rather than the user. One meaning,
 * nothing else (UI_RULES_v3).
 *
 * Its only honest source is `posts.origin`, which is `'plan_week'` when
 * `planMyWeek` drafted the post and `'manual'` when a person did. That is
 * POST-level: nothing in the schema records who published an individual
 * channel, so a blade must never appear on a variant row or next to a publish
 * claim, where it would imply Sahoda pressed publish.
 */

const NOW = new Date('2026-07-26T09:00:00.000Z')

function post(over: Partial<Post> = {}): Post {
  return {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    title: 'Monsoon menu',
    body: 'Fresh chai every morning.',
    channels: ['x'],
    status: 'draft',
    origin: 'manual',
    scheduled_at: null,
    created_at: '2026-07-26T08:00:00.000Z',
    updated_at: '2026-07-26T08:00:00.000Z',
    ...over,
  } as Post
}

const blades = () => document.querySelectorAll('.blade')

describe('the blade marks Sahoda authorship, post-level only', () => {
  test('a plan_week post shows exactly one blade', () => {
    render(<PostCard post={post({ origin: 'plan_week' })} now={NOW} mode={null} />)

    expect(blades()).toHaveLength(1)
  })

  test('a manual post shows none', () => {
    render(<PostCard post={post({ origin: 'manual' })} now={NOW} mode={null} />)

    expect(blades()).toHaveLength(0)
  })

  test('the planner row follows the same rule', () => {
    const { unmount } = render(
      <PlannerRow post={post({ origin: 'plan_week' })} now={NOW} mode={null} />,
    )
    expect(blades()).toHaveLength(1)
    unmount()

    render(<PlannerRow post={post({ origin: 'manual' })} now={NOW} mode={null} />)
    expect(blades()).toHaveLength(0)
  })

  test('the blade carries an accessible name — it is meaning, not decoration', () => {
    // A bare tinted rectangle is invisible to a screen reader, and this one
    // conveys who acted. It gets a label rather than aria-hidden.
    render(<PostCard post={post({ origin: 'plan_week' })} now={NOW} mode={null} />)

    expect(screen.getByLabelText(/sahoda/i)).toBeTruthy()
  })

  test('a published plan_week post still shows only ONE blade, next to authorship', () => {
    // The risk this guards: adding a second blade beside the publish chip would
    // read as "Sahoda published this", which the data cannot support.
    render(
      <PostCard post={post({ origin: 'plan_week', status: 'published' })} now={NOW} mode="live" />,
    )

    expect(blades()).toHaveLength(1)
  })
})

describe('post-level surfaces pass the publish mode through to the chip', () => {
  test('PostCard hands its mode to the chip', () => {
    render(<PostCard post={post({ status: 'published' })} now={NOW} mode="live" />)

    expect(screen.getByTestId('status-chip').className).toContain('is-real')
  })

  test('PlannerRow hands its mode to the chip', () => {
    render(<PlannerRow post={post({ status: 'published' })} now={NOW} mode="fixture" />)

    expect(screen.getByTestId('status-chip').className).toContain('is-simulated')
  })

  test('an unknown mode reaches the chip as the weaker claim on both surfaces', () => {
    const { unmount } = render(
      <PostCard post={post({ status: 'published' })} now={NOW} mode={null} />,
    )
    expect(screen.getByTestId('status-chip').className).not.toContain('is-real')
    unmount()

    render(<PlannerRow post={post({ status: 'published' })} now={NOW} mode={null} />)
    expect(screen.getByTestId('status-chip').className).not.toContain('is-real')
  })
})
