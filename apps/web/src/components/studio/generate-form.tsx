'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { GenerationMode } from '@sahoda/shared'

import { queueGeneration } from '@/app/actions/studio'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { Textarea } from '@/components/ui/textarea'
import type { StudioFormat } from '@/lib/studio/formats'
import { describeInsufficient } from '@/lib/studio/refusal-copy'

/**
 * ASKING FOR A PICTURE.
 *
 * ── THE COST IS SHOWN BEFORE ANYTHING IS SPENT, ALWAYS ──────────────────────
 * `CostLabel` is the same component every other paid action uses, so this screen
 * cannot drift from them. The number comes from `pricing.config.json` through
 * `creditCost`, never from a literal here.
 *
 * ── AND THE REFUSAL AT A ZERO BALANCE IS THE SERVER'S ───────────────────────
 * The button stays pressable at any balance on purpose: a top-up in another tab
 * must not require a reload here, and a disabled button teaches nothing about
 * why. The server refuses, the hold is released, and the sentence it returns is
 * the one shown.
 */

const MODES: readonly { id: GenerationMode; label: string; what: string }[] = [
  {
    id: 'on_brand',
    label: 'On brand',
    what: 'Uses what Sahoda knows about your business, so the picture looks like you.',
  },
  {
    id: 'explore',
    label: 'Explore',
    what: 'Ignores your brand on purpose, to find a direction before you commit to one.',
  },
]

export function GenerateForm({ formats, cost }: { formats: StudioFormat[]; cost: number }) {
  const router = useRouter()
  const [wanted, setWanted] = useState('')
  const [mode, setMode] = useState<GenerationMode>('on_brand')
  const [formatId, setFormatId] = useState(formats[0]?.id ?? '')
  const [note, setNote] = useState<string | null>(null)
  /**
   * True when the refusal was a shortfall rather than a fault. It decides
   * whether a way OUT is offered: "not enough credits" with nowhere to go is a
   * dead end, and this product forbids those. Held apart from the sentence
   * because only this arm has a remedy.
   */
  const [short, setShort] = useState(false)
  const [busy, start] = useTransition()

  const chosen = formats.find((f) => f.id === formatId) ?? null
  const ready = wanted.trim().length >= 3 && chosen !== null

  function generate() {
    setNote(null)
    setShort(false)
    start(async () => {
      const result = await queueGeneration({ mode, wanted, formatId })
      if (result.ok) {
        setWanted('')
        router.refresh()
        return
      }
      // The insufficient arm carries NUMBERS, not a sentence, precisely so the
      // sentence is written once and tested. See `refusal-copy.ts`.
      setShort(result.insufficient)
      setNote(
        result.insufficient
          ? describeInsufficient({ required: result.required, available: result.available })
          : result.message,
      )
    })
  }

  return (
    <section
      aria-labelledby="studio-make"
      className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-3"
      data-guide="studio-make"
    >
      <div>
        <h2 id="studio-make" className="type-h2">
          Make a picture
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Say what you want to see. Sahoda adds your colours and the way your business sounds, so
          you do not have to describe them every time.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="type-sm text-muted">What should the picture show?</span>
        <Textarea
          value={wanted}
          rows={3}
          maxLength={1000}
          placeholder="A plate of fresh samosas on a wooden counter, morning light"
          onChange={(event) => setWanted(event.target.value)}
          data-guide="studio-prompt"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="type-sm text-muted">How should Sahoda approach it?</legend>
        <div className="flex flex-wrap gap-2">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              aria-pressed={mode === option.id}
              className={`surface-ring rounded-card px-3 py-2 text-left type-sm transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                mode === option.id ? 'bg-primary text-primary-foreground' : 'bg-s2 text-muted'
              }`}
            >
              <span className="block font-[550]">{option.label}</span>
              <span className="block max-w-[34ch]">{option.what}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="type-sm text-muted">What size?</span>
        <select
          value={formatId}
          onChange={(event) => setFormatId(event.target.value)}
          className="surface-ring h-input w-fit rounded-sm bg-surface px-2 type-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          data-guide="studio-format"
        >
          {formats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </select>
        {chosen === null ? null : (
          <span className="type-sm text-muted">
            <span className="num">{chosen.width}</span> by{' '}
            <span className="num">{chosen.height}</span> pixels. Works on{' '}
            {chosen.channels.length === 1
              ? '1 channel'
              : `${chosen.channels.length} of your channels`}
            .
          </span>
        )}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={generate} loading={busy} disabled={!ready} data-guide="studio-generate">
          Make this picture
        </Button>
        <CostLabel action="Make a picture" cost={cost} />
        {note === null ? null : (
          <span role="alert" className="type-sm text-ink">
            {note}{' '}
            {/* A shortfall is the one refusal with a remedy, so it is the one
                that gets a way out. Every other failure here is ours to fix and
                a link would send somebody to spend money on a problem that is
                not theirs. */}
            {short ? (
              <Link
                href="/wallet"
                className="font-[600] underline underline-offset-2 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Top up your wallet
              </Link>
            ) : null}
          </span>
        )}
      </div>
    </section>
  )
}
