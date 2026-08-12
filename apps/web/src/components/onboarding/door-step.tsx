'use client'

import { useActionState, useEffect, useState } from 'react'

import { readDoor, type DoorState } from '@/app/actions/onboarding-door'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MIN_SENTENCE_CHARS } from '@/lib/onboarding/door'

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
  const [state, formAction, isPending] = useActionState<DoorState | null, FormData>(readDoor, null)
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

  // Announce the outcome once, when it arrives.
  const [announced, setAnnounced] = useState('')
  useEffect(() => {
    if (state?.ok) setAnnounced(`Read ${state.label}.`)
    else if (state) setAnnounced(state.message)
  }, [state])

  const read = state?.ok ? state : null
  // Suppressed while a new read is running or the form has moved on.
  const failure = state && !state.ok && !isPending && !dirty ? state : null

  function submit(): void {
    const data = new FormData()
    data.set('url', url)
    data.set('sentence', sentence)
    if (file) data.set('pdf', file)
    formAction(data)
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
          submit()
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
            className="w-full rounded-card border border-line bg-bg p-3 text-[14px] text-ink transition-micro placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
          <div className="mt-3">
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
            {read.note ? <p className="mt-1 text-[12.5px] text-muted">{read.note}</p> : null}
          </div>

          <div className="max-h-56 overflow-y-auto rounded-card border border-line bg-bg p-3">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
              {read.text.slice(0, PREVIEW_CHARS)}
              {read.text.length > PREVIEW_CHARS ? '…' : ''}
            </p>
          </div>

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
