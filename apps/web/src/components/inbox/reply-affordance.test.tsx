import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { evaluateSendWindow, type InboxPlatform } from '@sahoda/shared'

import { ReplyAffordanceCard } from './reply-affordance'

/**
 * These tests exist because the whole point of this component is a promise about
 * TIMING: the user must learn a thread cannot be replied to BEFORE writing a reply,
 * not after pressing send. A card that renders the right badge but leaves an enabled
 * textarea keeps the failure exactly where it was.
 */

const T0 = '2026-08-08T00:00:00.000Z'
const at = (hours: number): string => new Date(Date.parse(T0) + hours * 3_600_000).toISOString()

/** The full accessible description — every id in `aria-describedby`, resolved. */
const describedText = (el: HTMLElement): string =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')

const cardFor = (platform: InboxPlatform, hoursSinceInbound: number | null) =>
  evaluateSendWindow({
    platform,
    lastInboundAt: hoursSinceInbound === null ? null : T0,
    now: hoursSinceInbound === null ? T0 : at(hoursSinceInbound),
  })

describe('the compose control never invites a reply it cannot send', () => {
  test.each([
    ['instagram', 1],
    ['instagram', 25],
    ['instagram', 200],
    ['facebook', 1],
    ['facebook', 25],
    ['whatsapp', 1],
    ['whatsapp', 25],
  ] as const)('%s at +%ih renders a disabled textarea', (platform, hours) => {
    render(<ReplyAffordanceCard affordance={cardFor(platform, hours)} />)
    expect(screen.getByLabelText('Reply')).toBeDisabled()
  })

  test('the disabled field is described by the reason, not left bare', () => {
    render(<ReplyAffordanceCard affordance={cardFor('whatsapp', 25)} />)
    expect(describedText(screen.getByLabelText('Reply'))).toMatch(/template/i)
  })

  test.each([
    ['instagram', 1],
    ['instagram', 25],
    ['whatsapp', 25],
    ['instagram', 200],
  ] as const)(
    'every aria-describedby id resolves to a real element (%s at +%ih)',
    (platform, hours) => {
      render(<ReplyAffordanceCard affordance={cardFor(platform, hours)} />)
      const ids = (screen.getByLabelText('Reply').getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
      expect(ids.length).toBeGreaterThan(0)
      for (const id of ids) {
        expect(document.getElementById(id), `dangling aria-describedby: ${id}`).not.toBeNull()
      }
    },
  )

  test('the window reason is stated once, not repeated inside the composer', () => {
    render(<ReplyAffordanceCard affordance={cardFor('instagram', 200)} />)
    expect(screen.getAllByText(/customer needs to write again/i)).toHaveLength(1)
  })

  test('an OPEN window still says Sahoda cannot send — two different blockers', () => {
    render(<ReplyAffordanceCard affordance={cardFor('instagram', 1)} />)
    expect(screen.getByLabelText('Reply')).toBeDisabled()
    // The platform is not the blocker here, so the copy must not imply it is.
    expect(screen.getByText(/reply path is not wired/i)).toBeInTheDocument()
  })
})

describe('each regime explains itself', () => {
  test('instagram past 24h names HUMAN_AGENT as the only option', () => {
    render(<ReplyAffordanceCard affordance={cardFor('instagram', 25)} />)
    expect(screen.getByText('Tagged replies only')).toBeInTheDocument()
    const tags = screen.getByRole('list', { name: 'Allowed message tags' })
    expect(tags.textContent).toBe('HUMAN_AGENT')
  })

  test('facebook past 24h lists all four tags', () => {
    render(<ReplyAffordanceCard affordance={cardFor('facebook', 25)} />)
    const tags = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(tags).toHaveLength(4)
    expect(tags).toContain('HUMAN_AGENT')
    expect(tags).toContain('POST_PURCHASE_UPDATE')
  })

  test('facebook past 7 days drops HUMAN_AGENT and keeps the rest', () => {
    render(<ReplyAffordanceCard affordance={cardFor('facebook', 200)} />)
    const tags = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(tags).toHaveLength(3)
    expect(tags).not.toContain('HUMAN_AGENT')
  })

  test('whatsapp past 24h says template, and offers no tags', () => {
    render(<ReplyAffordanceCard affordance={cardFor('whatsapp', 25)} />)
    expect(screen.getByText('Template only')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Allowed message tags' })).toBeNull()
  })

  test('instagram past 7 days is closed, and says the customer must write again', () => {
    render(<ReplyAffordanceCard affordance={cardFor('instagram', 200)} />)
    expect(screen.getByText('Replies closed')).toBeInTheDocument()
    expect(screen.getByText(/customer needs to write again/i)).toBeInTheDocument()
  })
})

describe('what an unread thread is allowed to claim', () => {
  test('renders "window not known" rather than open or closed', () => {
    render(<ReplyAffordanceCard affordance={cardFor('instagram', null)} />)
    expect(screen.getByText('Window not known')).toBeInTheDocument()
    expect(screen.queryByText('Replies open')).toBeNull()
    expect(screen.queryByText('Replies closed')).toBeNull()
  })

  test('the unknown state is neutral, never styled as a failure', () => {
    const { container } = render(<ReplyAffordanceCard affordance={cardFor('instagram', null)} />)
    const section = container.querySelector('[data-window-state="unknown"]')
    expect(section).toBeTruthy()
    expect(section?.querySelector('.text-danger')).toBeNull()
  })
})

describe('the state chip cannot silently fall through', () => {
  test('every window state carries a distinct visible label', () => {
    const labels = new Set<string>()
    for (const a of [
      cardFor('instagram', 1),
      cardFor('instagram', 25),
      cardFor('instagram', 200),
      cardFor('whatsapp', 25),
      cardFor('instagram', null),
    ]) {
      const { container, unmount } = render(<ReplyAffordanceCard affordance={a} />)
      const chip = container.querySelector('[data-window-state] span')
      labels.add(chip?.textContent ?? '')
      unmount()
    }
    expect(labels.size).toBe(5)
    expect(labels.has('')).toBe(false)
  })
})
