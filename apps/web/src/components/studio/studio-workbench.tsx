'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Sparkles } from 'lucide-react'
import type { GenerationMode } from '@sahoda/shared'

import { queueGeneration } from '@/app/actions/studio'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { Textarea } from '@/components/ui/textarea'
import type { StudioFormat } from '@/lib/studio/formats'
import { MAX_REFERENCES, describeModeBlock, readyModes, ruleFor } from '@/lib/studio/modes'
import type { LibraryPicture } from '@/lib/studio/read'
import { describeInsufficient } from '@/lib/studio/refusal-copy'

/**
 * THE WORKBENCH: CONTROLS ON THE LEFT, THE PICTURE ON THE RIGHT.
 *
 * ── WHY THE CANVAS IS HALF THE SCREEN ───────────────────────────────────────
 * Judging a picture is the work. A thumbnail in a list is enough to know a
 * generation finished and not enough to decide whether to keep it, so the newest
 * result gets real space and everything else is a control beside it.
 *
 * ── THE CANVAS IS NEVER EMPTY, IT IS ALWAYS SAYING SOMETHING ────────────────
 * Before the first press it explains what will appear there. While a generation
 * runs it says so. After a refusal it carries the refusal. An empty rectangle
 * would read as something that failed to load.
 *
 * ── EVERY RULE IS ASKED OF `modes.ts`, NEVER RE-IMPLEMENTED HERE ────────────
 * Whether a mode may run, how many references it takes, and the sentence when it
 * may not, all come from one module the server action asks as well. A screen
 * that offered a mode the action refuses would waste a press; one that hid a
 * mode the action allows would cost a feature.
 */
export function StudioWorkbench({
  formats,
  cost,
  library,
}: {
  formats: StudioFormat[]
  cost: number
  /** Pictures already in this workspace, offered as things to match. */
  library: LibraryPicture[]
}) {
  const router = useRouter()
  const [wanted, setWanted] = useState('')
  const [mode, setMode] = useState<GenerationMode>('on_brand')
  const [formatId, setFormatId] = useState(formats[0]?.id ?? '')
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [short, setShort] = useState(false)
  const [made, setMade] = useState<{ url: string | null; prompt: string } | null>(null)
  const [busy, start] = useTransition()

  const rule = ruleFor(mode)
  const chosen = formats.find((f) => f.id === formatId) ?? null
  // Asked, never re-derived. See this file's header.
  const blocked = describeModeBlock({ mode, references: picked.length })
  const ready = wanted.trim().length >= 3 && chosen !== null && blocked === null

  function toggleReference(assetId: string) {
    setNote(null)
    setPicked((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : // Bounded here as well as in the rule, so the list cannot grow past
          // what the model will look at even for a moment.
          current.length >= MAX_REFERENCES
          ? current
          : [...current, assetId],
    )
  }

  function chooseMode(next: GenerationMode) {
    setNote(null)
    setMode(next)
    // Explore is unconditioned by definition, so keeping references selected
    // would leave a contradiction on screen that the person did not create.
    if (ruleFor(next).maxReferences === 0) setPicked([])
  }

  function generate() {
    setNote(null)
    setShort(false)
    start(async () => {
      const result = await queueGeneration({
        mode,
        wanted,
        formatId,
        referenceAssetIds: picked,
      })
      if (result.ok) {
        setMade({ url: null, prompt: wanted })
        // The picture itself arrives with the refreshed server data, which also
        // carries its signed link. Holding bytes in state here would put a
        // megabyte in the browser that the next navigation throws away.
        router.refresh()
        return
      }
      setShort(result.insufficient)
      setNote(
        result.insufficient
          ? describeInsufficient({ required: result.required, available: result.available })
          : result.message,
      )
    })
  }

  return (
    <div
      className="grid gap-4 wide:grid-cols-[minmax(0,420px)_minmax(0,1fr)] max-wide:grid-cols-1"
      data-guide="studio-workbench"
    >
      <section aria-labelledby="studio-make" className="flex flex-col gap-3">
        <div>
          <h2 id="studio-make" className="type-h2">
            Make a picture
          </h2>
          <p className="type-body mt-1 max-w-[54ch] text-muted">
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
          <div className="grid gap-2 narrow:grid-cols-3 max-narrow:grid-cols-1">
            {readyModes().map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => chooseMode(option.mode)}
                aria-pressed={mode === option.mode}
                className={`surface-ring rounded-card px-3 py-2 text-left transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  mode === option.mode ? 'bg-primary text-primary-foreground' : 'bg-s2 text-muted'
                }`}
              >
                <span className="block type-sm font-[550]">{option.label}</span>
                <span className="block type-sm">{option.what}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* ── WHAT TO MATCH ──────────────────────────────────────────────────
            Shown only for a mode that can use one. Offering a picture picker to
            Explore would invite a choice the mode then ignores. */}
        {rule.maxReferences === 0 ? null : (
          <fieldset className="flex flex-col gap-2" data-guide="studio-references">
            <legend className="type-sm text-muted">
              {rule.minReferences > 0
                ? 'Which picture should Sahoda match?'
                : 'Anything Sahoda should match? (optional)'}
            </legend>

            {library.length === 0 ? (
              <p className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
                You have no pictures yet. Make one below, or add photos to your library, and they
                appear here to match.
              </p>
            ) : (
              <ul className="grid grid-cols-4 gap-2">
                {library.map((picture) => {
                  const on = picked.includes(picture.assetId)
                  return (
                    <li key={picture.assetId}>
                      <button
                        type="button"
                        onClick={() => toggleReference(picture.assetId)}
                        aria-pressed={on}
                        className={`surface-ring relative block w-full overflow-hidden rounded-card transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          on ? 'ring-2 ring-accent' : ''
                        }`}
                      >
                        {picture.url === null ? (
                          <span className="flex aspect-square items-center justify-center bg-s2 type-sm text-muted">
                            no preview
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- a
                          // short-lived signed URL from a private bucket cannot be
                          // optimised without proxying the credential.
                          <img
                            src={picture.url}
                            alt={picture.title ?? 'A picture in your library'}
                            className="aspect-square w-full object-cover"
                          />
                        )}
                        {on ? (
                          <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                            <Check className="size-[13px]" aria-hidden />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </fieldset>
        )}

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
              <span className="num">{chosen.height}</span> pixels, for{' '}
              <span className="num">{chosen.channels.length}</span> of your channels.
            </span>
          )}
        </label>

        {blocked === null ? null : (
          <p role="status" className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
            {blocked}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={generate} loading={busy} disabled={!ready} data-guide="studio-generate">
            Make this picture
          </Button>
          <CostLabel action="Make a picture" cost={cost} />
        </div>

        {note === null ? null : (
          <p role="alert" className="type-sm text-ink">
            {note}{' '}
            {/* A shortfall is the one refusal with a remedy, so it is the one
                that gets a way out. */}
            {short ? (
              <Link
                href="/wallet"
                className="font-[600] underline underline-offset-2 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Top up your wallet
              </Link>
            ) : null}
          </p>
        )}
      </section>

      {/* ── THE CANVAS ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="studio-canvas" className="flex flex-col gap-2">
        <h2 id="studio-canvas" className="type-h2">
          The canvas
        </h2>
        <div
          className="surface-ring flex items-center justify-center rounded-card bg-s2 p-6"
          style={{
            aspectRatio: chosen === null ? '1 / 1' : `${chosen.width} / ${chosen.height}`,
          }}
          data-guide="studio-canvas"
        >
          <p className="max-w-[38ch] text-center type-sm text-muted">
            {busy ? (
              'Sahoda is drawing this now. It usually takes a few seconds, and you can leave this screen without losing it.'
            ) : made === null ? (
              <>
                <Sparkles className="mx-auto mb-2 size-[18px]" aria-hidden />
                Your picture appears here, at the size you picked, so you can judge it before you
                use it.
              </>
            ) : (
              'Made. It is in the list below and in your library.'
            )}
          </p>
        </div>
        <p className="type-sm text-muted">
          Every picture is saved to your library the moment it is made, so nothing is lost if you
          leave.
        </p>
      </section>
    </div>
  )
}
