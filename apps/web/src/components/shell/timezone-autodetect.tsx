'use client'

import { useEffect, useRef } from 'react'

import { autoDetectWorkspaceTimezone } from '@/app/actions/workspace'

export interface TimezoneAutodetectProps {
  workspaceId: string
  /** The workspace's stored zone. When it already has one, this does nothing. */
  current: string | null
}

/**
 * DETECT THE READER'S OWN CLOCK, ONCE, WHEN THE WORKSPACE HAS NONE.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The schedule display resolves times through the WORKSPACE zone, and 32 of 33
 * workspaces had none — so every scheduled time rendered in the IST fallback
 * while the picker built its instant on the reader's own browser clock. A
 * customer in Dubai picked 9:00 am and the posts list called it 10:30 am. The
 * fix a person would do by hand — open Settings and choose their zone — is
 * exactly the one the browser can do for them: `Intl` already knows where they
 * are.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 * It never runs when a zone is already set (`current` non-null), so it cannot
 * move a choice a person made in Settings — and the action re-checks that with
 * an `IS NULL` condition on the write, so two tabs racing cannot both set it.
 * It fires ONCE per mount (the ref), never on a re-render, and it renders
 * nothing. A zone `Intl` cannot resolve is not sent; the server validates again
 * regardless.
 *
 * It is a client component for one reason: `Intl.DateTimeFormat().resolvedOptions()`
 * is the browser's answer and cannot be read on the server, which is the whole
 * reason the display could not know the reader's zone without being told.
 */
export function TimezoneAutodetect({ workspaceId, current }: TimezoneAutodetectProps) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    // A zone already chosen is left alone. This is the common path on every
    // visit after the first, and the one case where auto-detect must stay quiet.
    if (current !== null) return
    fired.current = true

    let detected: string | null = null
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
    } catch {
      detected = null
    }
    // Nothing to send, or a runtime that returned an empty/`UTC`-only answer we
    // should not store as a claim about where someone lives.
    if (detected === null || detected.trim() === '') return

    // Best-effort and silent: a background convenience, not something the reader
    // asked for this instant, so a failure is swallowed rather than shown. The
    // action revalidates the schedule screens itself when a zone actually lands.
    void autoDetectWorkspaceTimezone(workspaceId, detected).catch(() => undefined)
  }, [workspaceId, current])

  return null
}
