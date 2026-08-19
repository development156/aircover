'use client'

import { useEffect, useState } from 'react'

import type { DoorState } from '@/app/actions/onboarding-door'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MIN_SENTENCE_CHARS } from '@/lib/onboarding/door'
import {
  doorErrorCode,
  doorTransportFailure,
  type DoorTransportFailure,
} from '@/lib/onboarding/door-transport-failure'

export interface DoorResult {
  text: string
  foundName: string
  colors: string[]
  label: string
  kind: string
}

export interface DoorStepProps {
  onContinue: (result: DoorResult) => void
  onBack: () => void
}

/** How much of the extracted text to show back before it is used. */
const PREVIEW_CHARS = 1200

/**
 * Screen 2 — the door.
 *
 * The read-back is not a nicety. Both document paths can fail plausibly rather
 * than loudly (`pdf-text.ts` explains how), and the only reliable check on
 * "is this actually your business?" is the person whose business it is. So the
 * extracted text is shown, and nothing moves until they say it is theirs.
 *
 * Reading is free and says so. The cost, when there is one, appears on the
 * resolve — never here.
 */
export function DoorStep({ onContinue, onBack }: DoorStepProps) {
  const [state, setState] = useState<DoorState | null>(null)
  const [isPending, setPending] = useState(false)
  /**
   * The stages the SERVER has reported, in order. Never invented here — each
   * line arrived because something finished on the other end.
   */
  const [stages, setStages] = useState<{ detail: string; ms: number; costUsd?: number }[]>([])
  const [sentence, setSentence] = useState('')

  /**
   * URL AND FILE ARE HELD HERE, not read off the DOM at submit time.
   *
   * React 19 RESETS an uncontrolled field inside `<form action={fn}>` once the
   * action completes. That is the reported bug: a failed read cleared the file
   * input back to "No file chosen" and blanked the URL, while the error from
   * that attempt stayed on screen — so the next press submitted an EMPTY form
   * and the user was looking at a message about a file the form no longer had.
   *
   * Holding both in state means the reset cannot take them, and the submit
   * builds its own FormData from what we hold rather than from what survived.
   */
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)

  /**
   * True when the form has changed since the result on screen was produced.
   *
   * `useActionState` keeps the last result until the next one lands, so an error
   * outlives the attempt that caused it: it is still rendered while the user
   * edits the form and while the NEXT read is in flight. A failure message that
   * describes an attempt nobody is making any more is a lie about the current
   * state, and it is what made this look like a door that never recovers.
   */
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (state) setDirty(false)
  }, [state])

  /**
   * A request that never produced a verdict about the document, held SEPARATELY
   * from a read that produced a negative one.
   *
   * They are two different situations and they need two different remedies. A
   * failed READ leaves "go on without it" open — the rest of onboarding needs
   * the intake sentence and the refusal, and the door is enrichment, so
   * resolving from less is a real and legitimate choice.
   *
   * A failed REQUEST does not. On `no_workspace` there is nowhere to save
   * anything, so "Continue without it" walks the user into a resolve that
   * returns "Create a workspace first" — a dead end dressed as a way forward.
   * On `signed_out` the same is true. So this branch never offers it.
   */
  const [blocked, setBlocked] = useState<DoorTransportFailure | null>(null)

  // Announce the outcome once, when it arrives.
  const [announced, setAnnounced] = useState('')
  useEffect(() => {
    if (state?.ok) setAnnounced(`Read ${state.label}.`)
    else if (state) setAnnounced(state.message)
    else if (blocked) setAnnounced(blocked.message)
  }, [state, blocked])

  /**
   * Elapsed seconds while a read runs.
   *
   * MEASURED IN PRODUCTION 2026-08-12: brand_extract p50 26.3s, p90 37.0s;
   * brand_guidelines p50 19.1s, p90 23.8s. Twenty-six seconds of a spinner with
   * no words is indistinguishable from a hang, and the person waiting has no way
   * to tell whether to keep waiting or reload — which is how a slow success gets
   * reported as a failure.
   */
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isPending) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [isPending])

  // Named from what was actually submitted, in the order the server tries them.
  const stage = file ? 'Reading your document' : url.trim() ? 'Reading your website' : 'Reading'
  const typicalSeconds = file ? 26 : 12

  const read = state?.ok ? state : null
  // Suppressed while a new read is running or the form has moved on.
  const failure = state && !state.ok && !isPending && !dirty ? state : null
  // Same rule, same reason: a message about an attempt nobody is making any
  // more is a lie about the current state.
  const stopped = blocked && !isPending && !dirty ? blocked : null

  async function submit(): Promise<void> {
    const data = new FormData()
    data.set('url', url)
    data.set('sentence', sentence)
    if (file) data.set('pdf', file)

    setPending(true)
    setStages([])
    setState(null)
    setBlocked(null)
    try {
      const res = await fetch('/api/onboarding/door', { method: 'POST', body: data })
      if (!res.ok || !res.body) {
        /**
         * THE DOCUMENT WAS NEVER OPENED ON THIS PATH, so nothing here may say
         * it was unreadable. The route names its cause — `signed_out`,
         * `no_workspace`, `workspace_unreadable`, `failed` — and this used to
         * discard all four for one sentence about the customer's website.
         * See `lib/onboarding/door-transport-failure.ts` for what each arm may
         * and may not claim.
         *
         * The body is read defensively: a platform 502 in front of the app
         * carries HTML, so `res.json()` rejects, and the crash path must not
         * crash. No body simply means no named cause.
         */
        const body = await res.json().catch(() => null)
        setBlocked(doorTransportFailure(res.status, doorErrorCode(body)))
        return
      }
      // NDJSON: one event per line. A chunk may split a line, so the tail is
      // carried over rather than parsed as if it were complete.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const raw of lines) {
          if (!raw.trim()) continue
          const event = JSON.parse(raw) as
            | { type: 'stage'; detail: string; ms: number; costUsd?: number }
            | { type: 'done'; result: DoorState }
          if (event.type === 'stage') {
            setStages((current) => [...current, event])
          } else {
            setState(event.result)
          }
        }
      }
    } catch {
      setState({ ok: false, message: 'The connection dropped while reading — try again.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[16px] font-bold text-ink">Show us how you already talk</p>
        <p className="mt-1 text-[13px] text-muted">
          A link, a PDF, or one sentence. If you give us more than one, we read the PDF — it is the
          one you wrote every word of. Reading is free.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="door-url">Your website</Label>
          <Input
            id="door-url"
            name="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setDirty(true)
            }}
            disabled={isPending}
            placeholder="yourbrand.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="door-pdf">
            A PDF <span className="font-normal text-muted">(a deck, a menu, a one-pager)</span>
          </Label>
          <input
            id="door-pdf"
            name="pdf"
            type="file"
            accept="application/pdf,.pdf"
            disabled={isPending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setDirty(true)
            }}
            className="rounded-card border border-line bg-bg p-2.5 text-[13px] text-ink file:mr-3 file:rounded-pill file:border-0 file:bg-s2 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink"
          />
          {/* The native control says "No file chosen" again the moment React
              resets the form, so what WE hold is stated separately — otherwise
              the page contradicts the request it is about to send. */}
          {file ? (
            <p className="text-[12px] text-muted">
              Holding <span className="font-semibold text-ink">{file.name}</span> (
              {Math.max(1, Math.round(file.size / 1024))} KB). It stays attached until you pick
              another or clear it.{' '}
              <button
                type="button"
                onClick={() => {
                  setFile(null)
                  setDirty(true)
                }}
                className="underline"
              >
                Clear
              </button>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="door-sentence">Or just tell us</Label>
          <textarea
            id="door-sentence"
            name="sentence"
            rows={3}
            disabled={isPending}
            value={sentence}
            onChange={(event) => {
              setSentence(event.target.value)
              setDirty(true)
            }}
            placeholder="We bake sourdough and celebration cakes on Prabhat Road, and nothing is bought in."
            className="w-full surface-ring rounded-card bg-surface p-3 text-[14px] text-ink transition-micro placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          {sentence.length > 0 && sentence.trim().length < MIN_SENTENCE_CHARS ? (
            <p className="text-[12px] text-muted">
              A few more words — that is too short to read anything from.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button type="submit" data-guide="onboarding.door-read" loading={isPending}>
            {isPending ? 'Reading…' : 'Read this'}
            {!isPending ? <span>· free</span> : null}
          </Button>
        </div>
      </form>

      {isPending ? (
        <div className="rounded-card border border-line bg-s1 p-4" role="status">
          <p className="text-[13px] font-semibold text-ink">
            {stages.at(-1)?.detail ?? 'Starting'}…{' '}
            <span className="num font-normal text-muted">{elapsed}s</span>
          </p>
          {/* Everything already finished, newest last. These are server events,
              so the list only grows when something actually happened. */}
          {stages.length > 1 ? (
            <ul className="mt-1.5 space-y-0.5">
              {stages.slice(0, -1).map((entry, index) => (
                <li key={`${entry.ms}-${index}`} className="text-[12.5px] text-muted">
                  {entry.detail}
                  <span className="num"> · {Math.round(entry.ms / 1000)}s</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1.5 text-[12.5px] text-muted">
            {file
              ? 'A document usually takes about 26 seconds, sometimes 40.'
              : 'A website usually takes about 12 seconds — we read up to five pages.'}
          </p>
          {elapsed > typicalSeconds * 2 ? (
            <p className="mt-1 text-[12.5px] text-warn">
              This is taking longer than usual. It is still going, and it will say so either way.
            </p>
          ) : null}
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announced}
      </p>

      {/*
        A FAILED DOOR MUST NOT LEAVE SOMEONE STUCK, and it must not let them
        walk on believing their document was read.

        Before this, a failure rendered the message and nothing else: `read` is
        null, so the continue button disappeared, and the only ways on were to
        retry or press Back. Correct in that it never proceeds on input we do
        not have — but silent about the fact that going on WITHOUT it is a real
        choice, and a legitimate one. The rest of the flow needs the intake
        sentence and the refusal; the door is the enrichment.

        So the failure states the trade in words, and the way forward is
        labelled with what it actually does. `onContinue` receives an EMPTY
        result: the reveal must be resolved from less, not from a document we
        never read.
      */}
      {/*
        A REQUEST THAT NEVER REACHED THE DOCUMENT.

        Separate from the block below on purpose. That one is Sahoda reporting
        it read something and could not use it, and the honest way on is to
        resolve from less. This one is Sahoda reporting it never looked — so it
        offers no verdict on the link or PDF, and it does not offer to continue
        without a document it has not established anything about. The form above
        still holds the URL and the file, so pressing Read this again resends
        exactly what was submitted.
      */}
      {stopped ? (
        <div role="alert" className="rounded-card border border-danger bg-danger-bg p-4">
          <p className="text-[13px] font-semibold text-danger">{stopped.message}</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Nothing was charged — reading is always free. Your link and PDF are still attached
            above.
          </p>
          <p className="mt-2 text-[12.5px] text-muted">
            {stopped.retryable
              ? 'Press Read this again when you are ready. Nothing about your document needs to change.'
              : 'Fix the sign-in or the workspace first — pressing Read this again now would fail the same way.'}
          </p>
        </div>
      ) : null}

      {failure ? (
        <div className="rounded-card border border-danger bg-danger-bg p-4">
          <p className="text-[13px] font-semibold text-danger">{failure.message}</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Nothing was charged — reading is always free.
          </p>
          <p className="mt-2 text-[12.5px] text-muted">
            You can try another link or PDF, type a sentence above, or go on without it. Going on
            without it means we resolve from what you have already told us, and nothing from that
            document — the Brain will be thinner, and every field stays a guess until you confirm
            it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onContinue({ text: '', foundName: '', colors: [], label: '', kind: 'sentence' })
              }
            >
              Continue without it
            </Button>
          </div>
        </div>
      ) : null}

      {read ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-s1 p-4">
          <div>
            <p className="text-[13px] font-semibold text-ink">
              Here is what we read from {read.label}
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              Check it is yours before we resolve anything from it.
            </p>
            {read.note ? (
              <p
                className={
                  read.fellBack
                    ? 'mt-1 rounded-input border border-warn-bg bg-warn-bg px-2.5 py-1.5 text-[12.5px] text-warn'
                    : 'mt-1 text-[12.5px] text-muted'
                }
              >
                {read.note}
              </p>
            ) : null}
          </div>

          <div className="max-h-56 overflow-y-auto surface-ring rounded-card bg-surface p-3">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
              {read.text.slice(0, PREVIEW_CHARS)}
              {read.text.length > PREVIEW_CHARS ? '…' : ''}
            </p>
          </div>

          {/* PAID WORK IS ALWAYS STATED. The escalation to OCR happens without
              asking — a shop owner should not be picking a parser — so the only
              honest counterpart is showing what it cost the moment it is done. */}
          {(read as { costUsd?: number }).costUsd ? (
            <p className="rounded-input border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink">
              The free reader found no text, so we used OCR to read the pictures. That cost about ₹
              {Math.max(1, Math.round((read as { costUsd: number }).costUsd * 88))} — an estimate
              for a short document, charged to us, not to your credits.
            </p>
          ) : null}

          {read.colors.length > 0 ? (
            <p className="text-[12.5px] text-muted">
              We also found the colour your site uses. The app will wear it after the reveal.
            </p>
          ) : (
            <p className="text-[12.5px] text-muted">
              We did not find a colour here, so the app keeps Sahoda&apos;s default.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-guide="onboarding.door-continue"
              onClick={() =>
                onContinue({
                  text: read.text,
                  foundName: read.foundName,
                  colors: read.colors,
                  label: read.label,
                  kind: read.kind,
                })
              }
            >
              That is us — continue
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
