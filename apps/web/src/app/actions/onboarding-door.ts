/**
 * The door's RESULT TYPE. The read itself lives in
 * `app/api/onboarding/door/route.ts`.
 *
 * It moved because a server action returns once, at the end: a ~26s wait cannot
 * be narrated honestly from the client, which knows only what it submitted. The
 * streamed route reports each stage as the server finishes it.
 *
 * This file is deliberately no longer `'use server'` — it exports a type, and a
 * second paid endpoint doing the same work is a second way to spend money with
 * nothing on screen able to explain it.
 */
export type DoorState =
  | {
      ok: true
      kind: 'pdf' | 'url' | 'sentence'
      text: string
      label: string
      foundName: string
      colors: string[]
      note: string | null
      fellBack: boolean
      stages?: { detail: string; ms: number; costUsd?: number }[]
      costUsd?: number
    }
  | { ok: false; message: string }
