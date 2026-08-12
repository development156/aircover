import 'server-only'

import { env } from '@/lib/env'

/**
 * Clerk invitations, over the REST API (doc 13 §4).
 *
 * `clerkClient` is not used anywhere in this repo — the only existing
 * server-side Clerk calls are raw fetches in the e2e fixtures — and this keeps
 * that shape rather than pulling the backend SDK in for two endpoints.
 *
 * Clerk must be in RESTRICTED mode for any of this to mean anything: without
 * it, anyone can sign up and an invitation is a courtesy rather than a gate.
 * That is a dashboard setting, so it is named in the handoff and cannot be
 * asserted from here.
 */

const BASE = 'https://api.clerk.com/v1'

export type InviteOutcome =
  | { ok: true; invitationId: string }
  | { ok: false; reason: 'not_configured' | 'already_invited' | 'failed'; message: string }

async function clerk(path: string, init: RequestInit): Promise<Response | null> {
  const key = env.CLERK_SECRET_KEY
  if (!key) return null
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    })
  } catch {
    return null
  }
}

export async function createInvitation(email: string): Promise<InviteOutcome> {
  const response = await clerk('/invitations', {
    method: 'POST',
    body: JSON.stringify({
      email_address: email,
      /**
       * WITHOUT THIS, EVERY INVITATION WE SEND IS UNUSABLE. Observed 2026-08-12.
       *
       * Clerk redeems the ticket and then redirects to the instance's default
       * landing URL, which is `/`. `/` is not public, so `middleware.ts` sends
       * the visitor to `/sign-in` — and a SIGN-IN page cannot consume a sign-up
       * ticket. The ticket is dropped one step before it is used, and the
       * visitor is shown "New sign-ups are currently restricted", which is true
       * and completely misleading: they were invited, and the invitation is
       * still pending. Clicking the link again reproduces it forever.
       *
       * `/sign-up(.*)` IS in `isPublicRoute`, so naming it explicitly lands the
       * ticket on the one page able to redeem it. Falls back to the bare path
       * when APP_URL is unset — a relative redirect still beats the default.
       */
      redirect_url: `${env.NEXT_PUBLIC_APP_URL ?? ''}/sign-up`,
      // Clerk resends rather than erroring on a repeat, which is what an admin
      // clicking Approve twice actually wants.
      notify: true,
      ignore_existing: true,
    }),
  })

  if (!response) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Clerk is not configured, so no invitation was sent.',
    }
  }

  if (!response.ok) {
    // 422 is Clerk's "this address already has an account or invitation".
    if (response.status === 422) {
      return {
        ok: false,
        reason: 'already_invited',
        message: 'That address already has an account or a live invitation.',
      }
    }
    return {
      ok: false,
      reason: 'failed',
      message: 'Clerk would not send that invitation. Nothing was changed.',
    }
  }

  const body = (await response.json().catch(() => null)) as { id?: string } | null
  if (!body?.id) {
    // A 200 with no id is not a sent invitation, whatever it looks like.
    return { ok: false, reason: 'failed', message: 'Clerk did not confirm the invitation.' }
  }

  return { ok: true, invitationId: body.id }
}

export async function revokeInvitation(invitationId: string): Promise<boolean> {
  const response = await clerk(`/invitations/${encodeURIComponent(invitationId)}/revoke`, {
    method: 'POST',
  })
  return Boolean(response?.ok)
}
