'use client'

import { X_POLL_MAX_MINUTES, X_POLL_OPTION_MAX, refusePoll } from '@sahoda/publishing/format'
import type { Channel } from '@sahoda/shared'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { VariantExtras } from '@/lib/posts/variant-extras'

/**
 * A poll, on the one card whose channel can carry one.
 *
 * ── PROGRESSIVE DISCLOSURE, AND WHY IT IS NOT A NICETY HERE ─────────────────
 * Someone posting one caption to two channels must never see seven option
 * panels. So nothing below the switch exists until the switch is on, and the
 * switch itself only appears on X and LinkedIn. The two channels ask for
 * genuinely different things — LinkedIn needs a question of its own and a
 * duration from a list of four; X's body IS the question and its duration is
 * minutes — so this renders what that channel actually needs rather than a union
 * of both with half the fields inert.
 *
 * ── EVERY RULE SHOWN HERE IS THE PUBLISHER'S ────────────────────────────────
 * `refusePoll` is imported from `@sahoda/publishing` and is the SAME function
 * `buildPlatformData` runs before any adapter is reached. The sentence under the
 * answers is the sentence the publish would fail with. Re-stating "2 to 4
 * answers" here would be a second copy of a bound, which is how a meter and a
 * publisher come to disagree.
 *
 * Those bounds are Zernio's own, measured from its refusals on 2026-08-20
 * (docs/32 §4.2) — polls are the one block its validator fully enforces.
 */

const SELECT_CLASS =
  'h-input w-full rounded-sm bg-s1 px-2.5 text-[13px] text-ink transition-micro shadow-[inset_0_0_0_1px_var(--line)] focus:bg-surface focus:outline-none max-narrow:min-h-[44px]'

/** The four codes LinkedIn takes, in the words a person uses for them. */
const LINKEDIN_DURATIONS: readonly { code: string; label: string }[] = [
  { code: 'ONE_DAY', label: '1 day' },
  { code: 'THREE_DAYS', label: '3 days' },
  { code: 'SEVEN_DAYS', label: '1 week' },
  { code: 'FOURTEEN_DAYS', label: '2 weeks' },
]

/** X takes minutes. These are the ones anyone picks, inside 5–10080. */
const X_DURATIONS: readonly { minutes: number; label: string }[] = [
  { minutes: 60, label: '1 hour' },
  { minutes: 360, label: '6 hours' },
  { minutes: 1440, label: '1 day' },
  { minutes: 4320, label: '3 days' },
  { minutes: X_POLL_MAX_MINUTES, label: '1 week' },
]

/** How many answer boxes to show. Four is the platform maximum, so four exist. */
const ANSWER_BOXES = 4

export interface PollOptionsProps {
  channel: Channel
  extras: VariantExtras
  onExtrasChange: (patch: VariantExtras) => void
  /** Files on the post. A poll and a photo are mutually exclusive on both channels. */
  mediaCount: number
}

export function PollOptions({ channel, extras, onExtrasChange, mediaCount }: PollOptionsProps) {
  const poll = extras.poll
  const on = poll !== undefined
  const answers = poll?.options ?? []

  const setPoll = (patch: Partial<NonNullable<VariantExtras['poll']>>) => {
    onExtrasChange({
      poll: {
        options: answers,
        ...(poll ?? {}),
        ...patch,
      },
    })
  }

  const filled = answers.filter((answer) => answer.trim() !== '')
  // The publisher's own verdict, not a local re-derivation. Only shown once the
  // writer has started answering — an empty poll is unfinished, not wrong.
  const refusal =
    on && filled.length > 0 ? refusePoll(channel, { ...poll, options: answers }) : null

  return (
    <div className="narrow:col-span-2 space-y-2">
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          data-poll-toggle={channel}
          checked={on}
          onChange={(event) =>
            onExtrasChange({
              poll: event.target.checked
                ? {
                    options: ['', ''],
                    ...(channel === 'x'
                      ? { durationMinutes: 1440 }
                      : { question: '', durationCode: 'THREE_DAYS' }),
                  }
                : undefined,
            })
          }
          className="size-4 accent-[var(--acc)]"
        />
        Add a poll
      </label>

      {on ? (
        <div className="space-y-2 rounded-sm bg-s1 p-3">
          {mediaCount > 0 ? (
            <p role="alert" className="text-[12.5px] text-danger">
              A poll cannot carry a photo. Remove the photo, or drop the poll.
            </p>
          ) : null}

          {channel === 'linkedin' ? (
            <div className="space-y-1.5">
              <Label htmlFor="poll-question">Question</Label>
              <Input
                id="poll-question"
                data-poll-question
                value={poll?.question ?? ''}
                placeholder="What should we open on Sundays?"
                onChange={(event) => setPoll({ question: event.target.value })}
              />
            </div>
          ) : (
            // Not an empty box on X: X polls have no question field, and adding
            // one would collect something no platform will show.
            <p className="text-[12.5px] text-muted">
              On X the post itself is the question. The answers go below.
            </p>
          )}

          <fieldset className="space-y-1.5">
            <legend className="text-[12px] text-muted">
              Answers, two to four
              {channel === 'x' ? (
                <>
                  , up to <span className="tabular-nums">{X_POLL_OPTION_MAX}</span> characters each
                </>
              ) : null}
            </legend>
            {Array.from({ length: ANSWER_BOXES }, (_unused, index) => (
              <Input
                key={index}
                data-poll-answer={index + 1}
                aria-label={`Answer ${index + 1}`}
                value={answers[index] ?? ''}
                placeholder={index < 2 ? 'Required' : 'Optional'}
                onChange={(event) => {
                  const next = Array.from({ length: ANSWER_BOXES }, (_u, i) =>
                    i === index ? event.target.value : (answers[i] ?? ''),
                  )
                  // Trailing blanks are dropped so the stored list is what would
                  // be sent; `refusePoll` counts non-empty answers either way.
                  while (next.length > 0 && next[next.length - 1] === '') next.pop()
                  setPoll({ options: next })
                }}
              />
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="poll-duration">Runs for</Label>
            <select
              id="poll-duration"
              data-poll-duration
              className={SELECT_CLASS}
              value={
                channel === 'x' ? String(poll?.durationMinutes ?? '') : (poll?.durationCode ?? '')
              }
              onChange={(event) =>
                setPoll(
                  channel === 'x'
                    ? { durationMinutes: Number(event.target.value) }
                    : { durationCode: event.target.value },
                )
              }
            >
              {channel === 'x'
                ? X_DURATIONS.map((option) => (
                    <option key={option.minutes} value={option.minutes}>
                      {option.label}
                    </option>
                  ))
                : LINKEDIN_DURATIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
            </select>
          </div>

          {refusal !== null ? (
            <p role="alert" className="text-[12.5px] text-danger">
              {refusal.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
