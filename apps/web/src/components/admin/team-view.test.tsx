import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { OpsAdmin } from '@sahoda/shared'

vi.mock('@/app/actions/ops-team', () => ({
  inviteAdmin: vi.fn(),
  revokeAdmin: vi.fn(),
  setAdminRole: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { TeamView } from './team-view'

/**
 * THE SEAT THAT IS AN OWNER TO NOBODY.
 *
 * `user_id` is null until Clerk's `user.created` webhook links a seat, and
 * `app.is_ops_admin()` matches on `user_id = auth.jwt() ->> 'sub'` — null never
 * satisfies it. So an unlinked owner cannot open /admin, and counting it as an
 * owner puts this component out of step with `ops_admin_revoke`.
 *
 * The fixture is AT THE BOUNDARY on purpose: one linked owner and one unlinked
 * one. Production had five owners and four that could sign in, and at that margin
 * the disagreement is invisible — the component and the database happen to reach
 * the same answer, and a test built on it proves nothing.
 */

function seat(over: Partial<OpsAdmin>): OpsAdmin {
  return {
    id: over.email ?? 'id',
    user_id: 'user_x',
    email: 'someone@sahodalabs.com',
    name: null,
    role: 'admin',
    status: 'active',
    last_active_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as OpsAdmin
}

const LINKED_OWNER = seat({ email: 'real@sahodalabs.com', role: 'owner', user_id: 'user_real' })
const UNLINKED_OWNER = seat({ email: 'invited@sahodalabs.com', role: 'owner', user_id: null })

function rowFor(email: string): HTMLElement {
  return screen.getByText(email).closest('tr') as HTMLElement
}

describe('an unlinked owner does not hold the last-owner guard open', () => {
  it('draws NO role control for the only owner who can sign in', () => {
    render(<TeamView admins={[LINKED_OWNER, UNLINKED_OWNER]} me="real@sahodalabs.com" isOwner />)
    // Two rows say `owner`. Only one of them is an owner.
    expect(within(rowFor('real@sahodalabs.com')).queryByRole('combobox')).toBeNull()
    // And the unlinked seat keeps its controls, because removing it strands nobody.
    expect(within(rowFor('invited@sahodalabs.com')).queryByRole('combobox')).not.toBeNull()
  })

  it('says plainly that the unlinked seat cannot sign in', () => {
    render(<TeamView admins={[LINKED_OWNER, UNLINKED_OWNER]} me="real@sahodalabs.com" isOwner />)
    expect(within(rowFor('invited@sahodalabs.com')).getByText(/not signed in yet/i)).toBeTruthy()
    expect(within(rowFor('real@sahodalabs.com')).queryByText(/not signed in yet/i)).toBeNull()
  })

  it('restores the controls once a SECOND owner can actually sign in', () => {
    const second = seat({ email: 'second@sahodalabs.com', role: 'owner', user_id: 'user_second' })
    render(
      <TeamView admins={[LINKED_OWNER, UNLINKED_OWNER, second]} me="real@sahodalabs.com" isOwner />,
    )
    expect(within(rowFor('real@sahodalabs.com')).queryByRole('combobox')).not.toBeNull()
  })
})
